'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { validatePassword } from '@/app/utils/validation';

const VerifyContent = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Checking Your Password Reset Link...');
    const [isVerified, setIsVerified] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        const verifyAccount = async () => {
            const token = searchParams.get('token');
            
            if (!token) {
                setStatus('error');
                setMessage('Invalid Password Reset Link');
                return;
            }

            try {
                const response = await fetch('/api/resetLink', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ token }),
                });

                const data = await response.json();

                if (data.status) {
                    setStatus('success');
                    setMessage('Link verified! Please reset your password.');
                    setIsVerified(true);
                } else {
                    setStatus('error');
                    setMessage(data.message || 'Invalid reset link');
                }
            } catch (error) {
                console.log(error);
                setStatus('error');
                setMessage('Something went wrong');
            }
        };

        verifyAccount();
    }, [searchParams, router]);

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (newPassword !== confirmPassword) {
            setMessage('Passwords do not match');
            return;
        }

        const passwordCheck = validatePassword(newPassword);
        if (passwordCheck) {
            setMessage(passwordCheck);
            return;
        }

        try {
            const token = searchParams.get('token');
            const response = await fetch('/api/resetPassword', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, newPassword }),
            });

            const data = await response.json();

            if (data.status) {
                setStatus('success');
                setMessage('Password reset successfully!');
                setTimeout(() => router.push('/auth/login'), 2000);
            } else {
                setStatus('error');
                setMessage(data.message || 'Password reset failed');
            }
        } catch (error) {
            setStatus('error');
            setMessage('Something went wrong ' + error);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <h1 className={`text-2xl mb-4 ${
                    status === 'success' ? 'text-green-600' : 
                    status === 'error' ? 'text-red-600' : 
                    'text-gray-600'
                }`}>
                    {message}
                </h1>
                {status === 'loading' && (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
                )}
                {isVerified && (
                    <form onSubmit={handlePasswordReset} className="mt-4 space-y-4">
                        <div>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="New Password"
                                className="p-2 border rounded"
                                required
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm Password"
                                className="p-2 border rounded"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                            Reset Password
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default function Page() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl mb-4 text-gray-600">Loading...</h1>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
                </div>
            </div>
        }>
            <VerifyContent />
        </Suspense>
    );
}