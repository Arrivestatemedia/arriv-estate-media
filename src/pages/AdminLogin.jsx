import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createPageUrl } from '../utils';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [tempPassword, setTempPassword] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-create admin account on page load
    const initAdminAccount = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const user = await base44.auth.me();
          if (user) {
            const response = await base44.functions.invoke('createAdminAccount', {});
            if (response.data.success) {
              setEmail(user.email);
              setTempPassword(response.data.temporary_password);
              setPassword(response.data.temporary_password);
            }
          }
        }
      } catch (err) {
        console.error('Error initializing admin account:', err);
      } finally {
        setInitializing(false);
      }
    };

    initAdminAccount();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await base44.functions.invoke('adminLogin', {
        email,
        password
      });

      if (response.data.success) {
        // Store admin info in localStorage
        localStorage.setItem('sales_member_id', response.data.admin.id);
        localStorage.setItem('sales_member_name', response.data.admin.full_name);
        localStorage.setItem('sales_member_email', response.data.admin.email);
        localStorage.setItem('admin_role', 'admin');

        // Redirect to Admin Hub
        navigate(createPageUrl('AdminHub'));
      } else {
        setError(response.data.error || 'Login failed');
      }
    } catch (err) {
      setError('Login failed. Please check your credentials.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Admin Login</CardTitle>
          <CardDescription>Sign in to your admin account</CardDescription>
        </CardHeader>
        <CardContent>
          {initializing ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#B8956A]"></div>
              <p className="text-gray-600 mt-4">Setting up admin account...</p>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            {tempPassword && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">
                <p className="font-semibold mb-2">Temporary password created:</p>
                <code className="block bg-blue-100 p-2 rounded text-xs break-all">{tempPassword}</code>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

              <p className="text-center text-sm text-gray-600">
                Admin Portal - Full Access
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}