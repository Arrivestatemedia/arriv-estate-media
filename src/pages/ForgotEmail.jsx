import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function ForgotEmail() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await base44.functions.invoke('lookupEmailByPhone', { phone });
      
      if (response.data.email) {
        setEmail(response.data.email);
        setSubmitted(true);
      } else {
        setSubmitted(true);
        setEmail(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to look up email. Please try again.');
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-[#B8956A]/30 bg-white">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-[#B8956A]" />
            </div>
          </div>
          <CardTitle className="text-[#1A1A1A]">Forgot Your Email?</CardTitle>
          <p className="text-sm text-[#1A1A1A]/60 mt-2">
            Enter your phone number to find your email address
          </p>
        </CardHeader>
        <CardContent>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="border-[#B8956A]/30 focus:border-[#B8956A]"
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
              >
                {loading ? 'Looking up...' : 'Find Email'}
              </Button>

              <Link to={createPageUrl('SignIn')}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/5"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Button>
              </Link>
            </form>
          ) : (
            <div className="space-y-4">
              {email ? (
                <>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-[#1A1A1A]/60 mb-2">Your email address is:</p>
                    <p className="text-lg font-semibold text-[#1A1A1A]">{email}</p>
                  </div>
                  <p className="text-sm text-[#1A1A1A]/60">
                    You can now use this email to sign in or reset your password.
                  </p>
                </>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-[#1A1A1A]/60">
                    No account found with this phone number. Please check the number and try again.
                  </p>
                </div>
              )}

              <Button
                onClick={() => {
                  setSubmitted(false);
                  setPhone('');
                  setEmail(null);
                }}
                variant="outline"
                className="w-full border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/5"
              >
                Try Another Number
              </Button>

              <Link to={createPageUrl('SignIn')}>
                <Button className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white">
                  Go to Sign In
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}