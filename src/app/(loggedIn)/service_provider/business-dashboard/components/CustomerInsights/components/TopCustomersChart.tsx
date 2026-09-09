"use client";

import { useState, useEffect, Suspense } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ROUTES } from "@/config/routes";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import {
  validateForgotPasswordIdentifier,
  validateForgotPasswordOtp,
  validateNewPassword
} from "@/app/(public)/auth/validation/forgotPasswordValidation";
import "@/app/(public)/auth/auth.css";

const OTP_VALIDITY_SECONDS = 120; // 2 minutes validity per code

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const prefilledIdentifier = searchParams.get("identifier") || "";

  const [step, setStep] = useState<"input_identifier" | "verify_otp" | "reset_password">(
    prefilledIdentifier ? "verify_otp" : "input_identifier"
  );

  const [identifier, setIdentifier] = useState(prefilledIdentifier);
  const [resolvedEmail, setResolvedEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // OTP verification state
  const [otpToken, setOtpToken] = useState("");
  const [otpTimer, setOtpTimer] = useState(OTP_VALIDITY_SECONDS);
  const [resendLoading, setResendLoading] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  // Password reset state
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    if (step !== "verify_otp" || otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, otpTimer]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (prefilledIdentifier) {
      handleInitialIdentifierSubmit(null, prefilledIdentifier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledIdentifier]);

  const checkRateLimit = (email: string, isResend = false) => {
    const key = `forgot_attempts_${email.trim().toLowerCase()}`;
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const lockoutMs = 15 * 60 * 1000;

    const rawData = localStorage.getItem(key);
    let data: { attempts?: number[]; blockedUntil?: number } = rawData ? JSON.parse(rawData) : {};

    if (data.blockedUntil && now < data.blockedUntil) {
      const remainingMs = data.blockedUntil - now;
      const remainingMins = Math.ceil(remainingMs / 60000);
      setIsRateLimited(true);
      return {
        allowed: false,
        message: `You have reached the maximum requests. Please try again in ${remainingMins} minute(s).`
      };
    }

    let attemptsArray = data?.attempts || [];
    let validAttempts = attemptsArray.filter(timestamp => now - timestamp < windowMs);

    if (validAttempts.length >= 5) {
      const blockedUntil = now + lockoutMs;
      localStorage.setItem(key, JSON.stringify({ attempts: validAttempts, blockedUntil }));
      setIsRateLimited(true);
      return {
        allowed: false,
        message: "You have reached the maximum requests. Please try again in 15 minutes."
      };
    }

    if (isResend) {
      validAttempts.push(now);
    }

    if (validAttempts.length > 5) {
      const blockedUntil = now + lockoutMs;
      localStorage.setItem(key, JSON.stringify({ attempts: validAttempts, blockedUntil }));
      setIsRateLimited(true);
    } else {
      localStorage.setItem(key, JSON.stringify({ attempts: validAttempts, blockedUntil: undefined }));
      setIsRateLimited(false);
    }

    return { allowed: true };
  };

  const handleInitialIdentifierSubmit = async (e: React.FormEvent | null, directIdentifier?: string) => {
    if (e) e.preventDefault();
    setError(null);

    const targetIdentifier = (directIdentifier || identifier).trim();
    const validationError = validateForgotPasswordIdentifier(targetIdentifier);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const { data: accountData, error: rpcError } = await supabase
        .rpc("resolve_account_for_password_reset", { identifier: targetIdentifier })
        .maybeSingle<{ resolved_email: string; is_confirmed: boolean }>();

      if (rpcError || !accountData || !accountData.is_confirmed) {
        setError("If an account exists with this email, you will receive a password reset link shortly.");
        setLoading(false);
        return;
      }

      const currentEmail = accountData.resolved_email;

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("status")
        .eq("email", currentEmail)
        .maybeSingle();

      if (userProfile?.status === "suspended") {
        setError("Your account is currently suspended. Please log in once your suspension period is done. Please check your email to know about your suspension details.");
        setLoading(false);
        return;
      }

      if (userProfile?.status === "deactivated") {
        setError("Your account is currently deactivated. Please log in directly to reactivate your account.");
        setLoading(false);
        return;
      }

      const rateCheck = checkRateLimit(currentEmail, true);
      if (!rateCheck.allowed) {
        setError(rateCheck.message ?? null);
        setLoading(false);
        return;
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(currentEmail, {
        redirectTo: `${window.location.origin}/auth/forgot_password`,
      });

      if (resetError) {
        setError("Account is unverified or not registered.");
        setLoading(false);
        return;
      }

      setResolvedEmail(currentEmail);
      setOtpTimer(OTP_VALIDITY_SECONDS);
      setStep("verify_otp");
    } catch {
      setError("Account is unverified or not registered.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForgotPasswordOtp(otpToken);
    if (validationError || otpTimer <= 0) {
      setError("Invalid token. Please check the code or try again.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: resolvedEmail,
        token: otpToken,
        type: "recovery",
      });

      if (error || !data.session) {
        setError("Invalid token. Please check the code or try again.");
        setLoading(false);
        return;
      }

      setStep("reset_password");
    } catch {
      setError("Invalid token. Please check the code or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpTimer > 0 || isRateLimited) return;

    const rateCheck = checkRateLimit(resolvedEmail, true);
    if (!rateCheck.allowed) {
      setError(rateCheck.message ?? null);
      setIsRateLimited(true);
      return;
    }

    setError(null);
    setResendLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail);
      if (error) {
        setError(error.message);
      } else {
        setOtpTimer(OTP_VALIDITY_SECONDS);
        setOtpToken("");
      }
    } catch {
      setError("Something went wrong resending the code.");
    } finally {
      setResendLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateNewPassword(passwords);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwords.newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .maybeSingle();

      if (userProfile?.status === "suspended") {
        await supabase.auth.signOut();
        setError("Your account is currently suspended. Please log in once your suspension period is done. Please check your email to know about your suspension details.");
        setLoading(false);
        return;
      }

      const role = userProfile?.role || user.user_metadata?.role || 'pet_owner';
      const mustChangePassword = user.user_metadata?.must_change_password;

      let registrationStatus = null;
      if (role === 'service_provider' || role === 'both_sp_po') {
        const { data: spInfo } = await supabase
          .from("sp_general_info")
          .select("registration_status")
          .eq("profiles_id", user.id)
          .maybeSingle();
        
        registrationStatus = spInfo?.registration_status;
      }

      router.refresh();

      if (role === 'admin' && mustChangePassword) {
        router.push("/auth/admin_first_login");
        return;
      }

      if (role === 'service_provider' || role === 'both_sp_po') {
        if (registrationStatus === 'approved') {
          router.push(ROUTES.SERVICE_PROVIDER.SUMMARY_DASHBOARD);
        } else {
          router.push(ROUTES.SERVICE_PROVIDER.ONBOARDING);
        }
      } else if (role === 'admin') {
        router.push(ROUTES.ADMIN.ADMIN_DASHBOARD);
      } else {
        router.push(ROUTES.PET_OWNER.DASHBOARD);
      }
    } catch {
      setError("Failed to update password. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="signup-wrapper">
      {step === "input_identifier" && (
        <form onSubmit={(e) => handleInitialIdentifierSubmit(e)} className="signup-card" noValidate>
          <h1>RESET PASSWORD</h1>
          <p className="otp-instructions">
            Enter your email address or username to receive a verification code.
          </p>

          {error && <p className="form-error-banner">{error}</p>}

          <div className="input-group" style={{ marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="Email address or username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="register-btn" disabled={loading}>
            {loading ? "Checking..." : "Send Verification Code"}
          </button>

          <p className="auth-redirect-text" style={{ marginTop: "20px" }}>
            Remembered your password?{" "}
            <Link href="/auth/login" className="login-link">
              Log In
            </Link>
          </p>
        </form>
      )}

      {step === "verify_otp" && (
        <form onSubmit={handleVerifyOtp} className="signup-card" noValidate>
          <h1>VERIFY YOUR ACCOUNT</h1>
          <p className="otp-instructions">
            We have sent a verification code to <strong>{resolvedEmail || identifier}</strong>. Please enter it below.
          </p>
          <p className="otp-spam-note">
            Didn&apos;t receive it? Check your spam or trash folder.
          </p>

          {error && <p className="form-error-banner">{error}</p>}

          <div className="input-group" style={{ marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otpToken}
              onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
              inputMode="numeric"
              disabled={otpTimer <= 0}
            />
          </div>

          {otpTimer > 0 ? (
            <p className="otp-timer">Code expires in {formatTimer(otpTimer)}</p>
          ) : (
            <p className="otp-timer otp-expired">Code expired.</p>
          )}

          <p className="otp-resend">
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendLoading || otpTimer > 0 || isRateLimited}
              className="resend-link"
            >
              {isRateLimited ? "Request limit reached" : "Resend code"}
            </button>
          </p>

          <button type="submit" className="register-btn" disabled={loading || !otpToken || otpTimer <= 0}>
            {loading ? "Verifying..." : "Verify Account"}
          </button>
        </form>
      )}

      {step === "reset_password" && (
        <form onSubmit={handlePasswordResetSubmit} className="signup-card" noValidate>
          <h1>CREATE NEW PASSWORD</h1>

          {error && <p className="form-error-banner">{error}</p>}

          <div className="input-group" style={{ marginBottom: "15px" }}>
            <div className="password-container">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="New Password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                maxLength={16}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="input-group" style={{ marginBottom: "20px" }}>
            <div className="password-container">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm New Password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                maxLength={16}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <button type="submit" className="register-btn" disabled={loading}>
            {loading ? "Updating..." : "Reset Password & Login"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="signup-wrapper"><div className="signup-card"><p>Loading...</p></div></div>}>
      <ForgotPasswordContent />
    </Suspense>
  );
}