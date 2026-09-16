import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Booking, BookingStatus } from '../type';
import { formatCurrency, formatStatus } from '../utils';

interface BookingDetailsModalProps {
  selectedBooking: Booking;
  setSelectedBooking: (booking: Booking | null) => void;
  handleUpdateStatus: (id: string, newStatus: BookingStatus, reason?: string) => void;
}

export default function BookingDetailsModal({ 
  selectedBooking, 
  setSelectedBooking, 
  handleUpdateStatus 
}: BookingDetailsModalProps) {
  const supabase = createClientComponentClient();

  // Rejection State
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Employee Assignment State (New Feature)
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [showCompleteInput, setShowCompleteInput] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch employees when the modal opens for a 'paid' (Upcoming) booking
  useEffect(() => {
    if (selectedBooking.booking_status === 'paid' && selectedBooking.sp_id) {
      const fetchEmployees = async () => {
        const { data, error } = await supabase
          .from('sp_employees_info')
          .select('id, employee_first_name, employee_last_name, employee_position')
          .eq('sp_id', selectedBooking.sp_id);
          
        if (data && !error) {
          setEmployees(data);
        }
      };
      fetchEmployees();
    }
  }, [selectedBooking, supabase]);

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert('Please enter a rejection reason');
      return;
    }
    handleUpdateStatus(selectedBooking.id, 'rejected', rejectionReason);
    setShowRejectInput(false);
    setRejectionReason('');
  };

  // New function to handle marking as completed with an assigned employee
  const handleComplete = async () => {
    if (!selectedEmployeeId) {
      alert('Please select an employee who handled this booking.');
      return;
    }

    setIsUpdating(true);
    try {
      // 1. Save the assigned employee ID to the booking_info table first
      const { error } = await supabase
        .from('booking_info')
        .update({ assigned_employee_id: selectedEmployeeId })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      // 2. Trigger the parent function to update the status to 'to_rate' and close modal
      handleUpdateStatus(selectedBooking.id, 'to_rate');
    } catch (err: any) {
      alert('Failed to assign employee: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(30, 58, 138, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '1.5rem', maxWidth: '600px', width: '100%', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'black', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
          Booking Details
        </h3>
        
        {/* Basic Booking Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          <div><span style={{ color: '#64748b', display: 'block' }}>Date & Time</span><strong>{selectedBooking.booking_date} ({selectedBooking.booking_timeslot})</strong></div>
          <div><span style={{ color: '#64748b', display: 'block' }}>Total Amount</span><strong>{formatCurrency(selectedBooking.booking_total_amount)}</strong></div>
          <div><span style={{ color: '#64748b', display: 'block' }}>Status</span><strong style={{ textTransform: 'capitalize' }}>{formatStatus(selectedBooking.booking_status)}</strong></div>
          <div><span style={{ color: '#64748b', display: 'block' }}>Created At</span><strong>{new Date(selectedBooking.created_at).toLocaleString()}</strong></div>
        </div>

        {/* Rejection Reason (if exists) */}
        {selectedBooking.booking_rejection_reason && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#dc2626', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Rejection Reason</p>
            <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>{selectedBooking.booking_rejection_reason}</p>
          </div>
        )}

        {/* Pets & Services Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontWeight: 'bold', marginBottom: '0.75rem' }}>Pet(s) & Services</h4>
          {selectedBooking.booking_pet_info && selectedBooking.booking_pet_info.length > 0 ? (
            selectedBooking.booking_pet_info.map((pet) => (
              <div key={pet.id} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '0.75rem', border: '1px solid #e2e8f0' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{pet.booking_pet_name} <span style={{ color: '#64748b', fontWeight: 'normal', fontSize: '0.85rem' }}>({pet.booking_pet_type})</span></p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', color: '#334155' }}>
                  <p><strong>Breed:</strong> {pet.booking_breed}</p>
                  <p><strong>Gender:</strong> {pet.booking_gender}</p>
                  <p><strong>Weight:</strong> {pet.booking_weight} kg ({pet.booking_calculated_size})</p>
                  <p><strong>Behavior:</strong> {pet.booking_behavior?.join(', ') || 'N/A'}</p>
                </div>

                {/* Nested Services List */}
                {pet.booking_service_info && pet.booking_service_info.length > 0 && (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Services:</p>
                    <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#475569' }}>
                      {pet.booking_service_info.map((srv) => (
                        <li key={srv.id}>
                          {srv.booking_service_name} - {formatCurrency(srv.booking_price)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic' }}>No pet information attached.</p>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
          
          {/* Action: For Pending Bookings */}
          {selectedBooking.booking_status === 'pending_sp_response' && (
            <>
              {showRejectInput && (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Rejection Reason:</label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    style={{ width: '100%', padding: '0.75rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' }}
                    rows={3}
                  />
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={handleReject}
                      style={{ flex: 1, padding: '0.75rem 1.5rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectionReason('');
                      }}
                      style={{ padding: '0.75rem 1.5rem', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!showRejectInput && (
                <>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    style={{ padding: '0.75rem 1.5rem', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
                  >
                    Reject Booking
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedBooking.id, 'approved')}
                    style={{ padding: '0.75rem 1.5rem', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
                  >
                    Approve Booking
                  </button>
                </>
              )}
            </>
          )}

          {/* Action: For Upcoming (Paid) Bookings - NEW EMPLOYEE DROPDOWN */}
          {selectedBooking.booking_status === 'paid' && (
            <>
              {showCompleteInput ? (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Assign Staff / Employee:</label>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', background: 'white', border: '1px solid #cbd5e1', borderRadius: '0.5rem', fontSize: '0.875rem', marginBottom: '1rem' }}
                  >
                    <option value="">-- Select an employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employee_first_name} {emp.employee_last_name} ({emp.employee_position.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                  
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      onClick={handleComplete}
                      disabled={isUpdating}
                      style={{ flex: 1, padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', opacity: isUpdating ? 0.7 : 1 }}
                    >
                      {isUpdating ? 'Saving...' : 'Confirm Completion'}
                    </button>
                    <button
                      onClick={() => { 
                        setShowCompleteInput(false); 
                        setSelectedEmployeeId(''); 
                      }}
                      style={{ padding: '0.75rem 1.5rem', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCompleteInput(true)}
                  style={{ padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
                >
                  Mark as Completed
                </button>
              )}
            </>
          )}

          <button
            onClick={() => {
              setSelectedBooking(null);
              setShowRejectInput(false);
              setShowCompleteInput(false);
              setRejectionReason('');
              setSelectedEmployeeId('');
            }}
            style={{ padding: '0.75rem 1.5rem', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '0.75rem', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem', transition: 'background 0.2s' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}