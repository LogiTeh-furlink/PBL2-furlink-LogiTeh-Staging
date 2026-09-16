-- File: database/booking/01_create_booking_info.sql
-- Latest Update: August 3, 2026

-- Setup Booking Info Table
-- Depends on: auth_module.profiles, public.sp_general_info

CREATE TABLE IF NOT EXISTS public.booking_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profiles_id UUID NOT NULL REFERENCES auth_module.profiles(id),
    sp_id UUID NOT NULL REFERENCES public.sp_general_info(id),
    booking_date DATE NOT NULL,
    booking_timeslot TEXT NOT NULL,
    booking_status TEXT DEFAULT 'pending_sp_response' CHECK (
        booking_status IN ('pending_sp_response', 'approved', 'rejected', 'paid', 'cancelled', 'to_rate', 'rated')
    ),
    booking_rejection_reason VARCHAR(250), -- only present once rejected
    booking_total_amount NUMERIC(10, 2) NOT NULL CHECK (booking_total_amount >= 0),
    paymongo_session_id TEXT UNIQUE, -- only present once payment is initiated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Added columns
ALTER TABLE public.booking_info
    ADD COLUMN IF NOT EXISTS booking_overall_rating INTEGER
        CHECK (booking_overall_rating IS NULL OR booking_overall_rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS booking_staff_rating INTEGER
        CHECK (booking_staff_rating IS NULL OR booking_staff_rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS booking_comment VARCHAR(250);

CREATE OR REPLACE TRIGGER update_booking_info_modtime
    BEFORE UPDATE ON public.booking_info
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- RLS Policies
ALTER TABLE public.booking_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bookings are viewable by the pet owner or the provider" ON public.booking_info;
CREATE POLICY "Bookings are viewable by the pet owner or the provider" ON public.booking_info
    FOR SELECT USING (
        auth.uid() = profiles_id
        OR EXISTS (
            SELECT 1 FROM public.sp_general_info sp
            WHERE sp.id = booking_info.sp_id AND sp.profiles_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Pet owners can create bookings" ON public.booking_info;
CREATE POLICY "Pet owners can create bookings" ON public.booking_info
    FOR INSERT WITH CHECK (auth.uid() = profiles_id);

DROP POLICY IF EXISTS "Pet owner or provider can update a booking" ON public.booking_info;
CREATE POLICY "Pet owner or provider can update a booking" ON public.booking_info
    FOR UPDATE USING (
        auth.uid() = profiles_id
        OR EXISTS (
            SELECT 1 FROM public.sp_general_info sp
            WHERE sp.id = booking_info.sp_id AND sp.profiles_id = auth.uid()
        )
    );

ALTER TABLE public.booking_info
ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES public.sp_employees_info(id) ON DELETE SET NULL;