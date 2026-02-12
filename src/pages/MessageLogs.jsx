import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Search, Mail, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function MessageLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['messageLogs'],
    queryFn: () => base44.entities.MessageLog.list('-created_date', 100),
  });

  if (userLoading || isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-4 text-center">
        <p className="text-red-600">Admin access required</p>
      </div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.recipient_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.recipient_phone?.includes(searchQuery) ||
      log.message_content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.job_id?.includes(searchQuery);

    const matchesType = filterType === 'all' || log.message_type === filterType;
    const matchesStatus = filterStatus === 'all' || log.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Message Logs</h1>
          <p className="text-slate-600">View all SMS and email messages sent to clients and media partners</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-slate-700 mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by email, phone, job ID, or message content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Message Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="all">All Types</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md text-sm"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Message Logs */}
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-slate-600">No messages found</p>
              </CardContent>
            </Card>
          ) : (
            filteredLogs.map((log) => (
              <Card key={log.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {log.message_type === 'sms' ? (
                          <MessageSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Mail className="w-5 h-5 text-slate-600" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {log.message_type === 'sms' ? 'SMS' : 'EMAIL'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {log.recipient_type}
                            </Badge>
                            {log.reminder_type && (
                              <Badge variant="outline" className="text-xs">
                                {log.reminder_type.replace(/_/g, ' ')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">
                            {log.recipient_email || log.recipient_phone}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {log.status === 'success' ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-medium">Sent</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs font-medium">Failed</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      {log.subject && (
                        <p className="text-sm font-semibold text-slate-900 mb-2">
                          Subject: {log.subject}
                        </p>
                      )}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                        {log.message_content}
                      </p>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
                      <div className="flex items-center gap-4">
                        {log.job_id && (
                          <span>Job ID: <span className="font-mono">{log.job_id}</span></span>
                        )}
                        <span>
                          Sent: {format(new Date(log.created_date), 'MMM dd, yyyy HH:mm:ss')}
                        </span>
                      </div>
                      {log.error_message && (
                        <div className="text-red-600 text-xs">
                          Error: {log.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}