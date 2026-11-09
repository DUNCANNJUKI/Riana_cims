import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock, CheckCircle2, AlertTriangle, FileText, FileCheck2, ArrowRight,
  Building2, User, Phone, Mail, ShieldCheck, RefreshCw, ChevronRight
} from 'lucide-react';
import { API_URL } from '@/integrations/apiClient';

interface TrackingData {
  ticket_number: string;
  title: string;
  category: string;
  status: string;
  current_stage: string;
  stage_index: number;
  stages: Array<{
    key: string;
    label: string;
    description: string;
    completed: boolean;
    current: boolean;
  }>;
  created_at: string;
  updated_at: string;
  client: {
    client_name: string;
    branch_name?: string | null;
    department_name?: string | null;
  };
  client_representative: {
    name: string;
    phone: string;
    email: string;
  };
  account_manager: {
    name: string;
    email: string;
  };
  latest_completion_report?: {
    id: string;
    version_number: number;
    status: string;
    sent_at: string;
    acceptance_token?: string;
  } | null;
  acceptance?: {
    accepted_at: string;
    sign_off_method: string;
    client_representative_name: string;
    client_representative_designation: string;
  } | null;
}

export const ClientRequestTracking: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = async () => {
    if (!token) {
      setError('A valid tracking token is required.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/public/change-requests/track/${token}`);
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Failed to load tracking information.');
        return;
      }
      setData(result.tracking);
    } catch (err: any) {
      setError(err.message || 'Unable to connect to tracking servers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracking();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Fetching real-time tracking status...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full border-red-200 dark:border-red-900 shadow-lg bg-white dark:bg-slate-900">
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-bold text-red-700 dark:text-red-400">Tracking Unavailable</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-teal-700 dark:text-teal-400">RIANA</span>
              <span className="text-sm px-2 py-0.5 font-semibold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded">
                LIFECYCLE TRACKER
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              {data.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ticket: <strong className="text-teal-700 dark:text-teal-400 font-mono">{data.ticket_number}</strong> • Category: {data.category}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchTracking} className="self-start sm:self-center">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Status
          </Button>
        </div>

        {/* Completion Report Action Callout */}
        {data.latest_completion_report && data.latest_completion_report.acceptance_token && (
          <div className="bg-teal-50 dark:bg-teal-950/40 border-2 border-teal-600 rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 rounded-full flex items-center justify-center flex-shrink-0">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-base">
                  Formal Completion Report Available
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Version {data.latest_completion_report.version_number} has been issued for client review and acceptance sign-off.
                </p>
              </div>
            </div>
            <Button asChild className="bg-teal-700 hover:bg-teal-800 text-white font-medium flex-shrink-0">
              <Link to={`/change-request/review/${data.latest_completion_report.acceptance_token}`}>
                Review & Sign Off <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        )}

        {/* Stage Progress Stepper */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600" />
              Change Request Progression
            </CardTitle>
            <CardDescription>
              Transparent end-to-end tracking from client initiation through engineering verification and acceptance.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="relative pl-6 sm:pl-8 space-y-8 before:absolute before:left-[11px] sm:before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {data.stages.map((stage, idx) => (
                <div key={stage.key} className="relative flex items-start group">
                  <div
                    className={`absolute -left-6 sm:-left-8 top-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                      stage.completed
                        ? 'bg-emerald-600 text-white'
                        : stage.current
                        ? 'bg-teal-600 text-white ring-4 ring-teal-100 dark:ring-teal-950 animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}
                  >
                    {stage.completed ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <div className="ml-3 sm:ml-4 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm sm:text-base font-semibold ${
                          stage.current
                            ? 'text-teal-700 dark:text-teal-400 font-bold'
                            : stage.completed
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {stage.label}
                      </span>
                      {stage.current && (
                        <Badge className="bg-teal-600 text-white text-[11px] px-2 py-0.5 uppercase tracking-wide">
                          Current Stage
                        </Badge>
                      )}
                      {stage.completed && (
                        <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400 border-emerald-300 text-[11px] px-2 py-0">
                          Done
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {stage.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Client & Account Manager Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" /> Client Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{data.client.client_name}</p>
              <p className="text-slate-600 dark:text-slate-400 text-xs">
                {data.client.branch_name || 'Main Branch'} {data.client.department_name ? `• ${data.client.department_name}` : ''}
              </p>
              <div className="pt-2 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
                <span className="block font-medium text-slate-700 dark:text-slate-300">Client Representative:</span>
                <span>{data.client_representative.name} ({data.client_representative.phone})</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <User className="w-4 h-4 text-teal-600" /> Assigned Riana Account Manager
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{data.account_manager.name}</p>
              <p className="text-slate-600 dark:text-slate-400 text-xs truncate">{data.account_manager.email}</p>
              <div className="pt-2 text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
                <p>For inquiries or urgent adjustments, please contact your Account Manager directly.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ClientRequestTracking;
