import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SalesJobApplication() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    dob: '',
    linkedin: '',
    portfolioLink: '',
    lastRelatedJob: '',
    whyGoodFit: '',
    race: '',
    eEOCagreed: false,
    signature: '',
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeUrl, setResumeUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job');

  const MAX_RESUME_SIZE = 10 * 1024 * 1024; // 10MB

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_RESUME_SIZE) {
      setError(`Resume "${file.name}" is too large (max 10MB)`);
      return;
    }
    setError('');
    setResumeFile(file);
    setExtracting(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const url = uploadRes.file_url;
      setResumeUrl(url);

      const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: url,
        json_schema: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            address: { type: "string" },
            linkedin: { type: "string" },
            lastRelatedJob: { type: "string" },
          }
        }
      });

      const raw = extractRes.output;
      const out = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
      setFormData(prev => ({
        ...prev,
        fullName: out.fullName || prev.fullName,
        email: out.email || prev.email,
        phone: out.phone || prev.phone,
        address: out.address || prev.address,
        linkedin: out.linkedin || prev.linkedin,
        lastRelatedJob: out.lastRelatedJob || prev.lastRelatedJob,
      }));
    } catch (err) {
      setError('Could not read your resume — please fill in the fields manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        dob: formData.dob,
        linkedin: formData.linkedin,
        portfolioLink: resumeUrl,
        resumeUrl: resumeUrl,
        resumeFileName: resumeFile?.name || '',
        lastRelatedJob: formData.lastRelatedJob,
        whyGoodFit: formData.whyGoodFit,
        race: formData.race || '',
        eEOCagreed: formData.eEOCagreed,
        signature: formData.signature,
        videoUrls: [],
        pictureUrls: [],
        position: 'Sales Growth Advisor',
        jobId: jobId || null
      };

      const response = await base44.functions.invoke('uploadJobApplicationFiles', payload);
      if (response.data.success) {
        setSubmitted(true);
        setFormData({ fullName: '', email: '', phone: '', address: '', dob: '', linkedin: '', portfolioLink: '', lastRelatedJob: '', whyGoodFit: '', race: '', eEOCagreed: false, signature: '' });
        setResumeFile(null);
        setResumeUrl('');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Application Submitted!</h2>
            <p className="text-slate-600 mb-4">Your Sales Growth Advisor application has been received and will be reviewed. If we like what we see, someone from our team will be in contact with you shortly.</p>
            <Button onClick={() => setSubmitted(false)}>Submit Another Application</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Arriv Estate Media LLC Sales Growth Advisor Application</CardTitle>
            <CardDescription>Submit your application to join our founding sales team</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Important Notice:</strong> This application is not a contract of employment. Submission of this application does not guarantee a position or establishment of an employment relationship. You are applying to work as an independent contractor.
              </p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Resume *</label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 transition-colors">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleResumeUpload}
                  className="hidden"
                  id="resume-input"
                />
                <label htmlFor="resume-input" className="cursor-pointer block">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm text-slate-700 font-medium">Click to upload your resume</p>
                  <p className="text-xs text-slate-500">PDF, DOC, DOCX (max 10MB) — we'll try to pre-fill the form for you</p>
                </label>
              </div>
              {extracting && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Reading your resume and pre-filling...
                </div>
              )}
              {resumeFile && !extracting && (
                <p className="mt-2 text-xs text-slate-600">✓ {resumeFile.name}</p>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Personal Information</h3>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <Input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    required
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    required
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address *</label>
                  <Input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    placeholder="123 Main St, City, State 12345"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth *</label>
                  <Input
                    type="date"
                    name="dob"
                    value={formData.dob}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn Profile URL *</label>
                  <Input
                    type="text"
                    name="linkedin"
                    value={formData.linkedin}
                    onChange={handleInputChange}
                    required
                    placeholder="https://linkedin.com/in/yourprofile (or type N/A if you don't have one)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Related Job/Experience *</label>
                  <textarea
                    name="lastRelatedJob"
                    value={formData.lastRelatedJob}
                    onChange={handleInputChange}
                    required
                    placeholder="Describe your most recent relevant sales or professional experience..."
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    rows="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Why do you believe you are a good fit? *</label>
                  <textarea
                    name="whyGoodFit"
                    value={formData.whyGoodFit}
                    onChange={handleInputChange}
                    required
                    placeholder="Tell us why you think you would be an excellent Sales Growth Advisor..."
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    rows="4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Race/Ethnicity (Optional)</label>
                  <select
                    name="race"
                    value={formData.race}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="">Prefer not to answer</option>
                    <option value="white">White</option>
                    <option value="black_african_american">Black or African American</option>
                    <option value="hispanic_latino">Hispanic or Latino</option>
                    <option value="asian">Asian</option>
                    <option value="native_american">Native American or Alaska Native</option>
                    <option value="pacific_islander">Native Hawaiian or Pacific Islander</option>
                    <option value="two_or_more">Two or more races</option>
                  </select>
                </div>

                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <input
                    type="checkbox"
                    name="eEOCagreed"
                    checked={formData.eEOCagreed}
                    onChange={handleInputChange}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    id="eeoc"
                  />
                  <label htmlFor="eeoc" className="text-xs text-slate-700 leading-relaxed">
                    <strong>Equal Employment Opportunity Notice:</strong> Arriv Estate Media LLC is an Equal Employment Opportunity employer. We are committed to building and maintaining a diverse and inclusive workforce. We provide equal employment opportunities to all qualified applicants and employees without regard to race, color, religion, sex, national origin, age, disability, sexual orientation, gender identity, veteran status, or any other characteristic protected by applicable federal, state, or local law. This commitment applies to all aspects of employment, including recruitment, hiring, compensation, promotion, and termination.
                  </label>
                </div>

              </div>

              <div className="space-y-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-3">Electronic Signature *</label>
                  <p className="text-xs text-slate-700 mb-3 leading-relaxed">
                    By typing your full name below, you are electronically signing this application. Your electronic signature has the same legal force and effect as a handwritten signature and indicates that you have read, understood, and agree to all terms, conditions, disclosures, and authorizations contained in this application.
                  </p>
                  <Input
                    type="text"
                    name="signature"
                    value={formData.signature}
                    onChange={handleInputChange}
                    placeholder="Type your full name as your signature"
                    className="text-lg tracking-wider font-semibold"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !formData.fullName || !formData.email || !formData.phone || !formData.address || !formData.dob || !formData.linkedin || !resumeFile || !formData.lastRelatedJob || !formData.whyGoodFit || !formData.eEOCagreed || !formData.signature}
                className="w-full bg-slate-900 hover:bg-slate-800"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Application'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}