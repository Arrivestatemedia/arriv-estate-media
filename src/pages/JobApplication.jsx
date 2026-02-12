import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function JobApplication() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    dob: '',
    ssn: '',
    linkedin: '',
    portfolioLink: '',
    lastRelatedJob: '',
    whyGoodFit: '',
    backgroundCheckAgreed: false,
  });
  const [videoFiles, setVideoFiles] = useState([]);
  const [pictureFiles, setPictureFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleVideoUpload = (e) => {
    setVideoFiles(Array.from(e.target.files || []));
  };

  const handlePictureUpload = (e) => {
    setPictureFiles(Array.from(e.target.files || []));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formPayload = new FormData();
      formPayload.append('fullName', formData.fullName);
      formPayload.append('email', formData.email);
      formPayload.append('phone', formData.phone);
      formPayload.append('address', formData.address);
      formPayload.append('dob', formData.dob);
      formPayload.append('ssn', formData.ssn);
      formPayload.append('linkedin', formData.linkedin);
      formPayload.append('portfolioLink', formData.portfolioLink);
      formPayload.append('lastRelatedJob', formData.lastRelatedJob);
      formPayload.append('whyGoodFit', formData.whyGoodFit);
      formPayload.append('backgroundCheckAgreed', formData.backgroundCheckAgreed);

      videoFiles.forEach((file) => formPayload.append('videos', file));
      pictureFiles.forEach((file) => formPayload.append('pictures', file));

      const response = await base44.functions.invoke('uploadJobApplicationFiles', formPayload);

      if (response.data.success) {
        setSubmitted(true);
        setFormData({ fullName: '', email: '', phone: '', address: '', dob: '', ssn: '', linkedin: '', portfolioLink: '', lastRelatedJob: '', whyGoodFit: '', backgroundCheckAgreed: false });
        setVideoFiles([]);
        setPictureFiles([]);
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
            <p className="text-slate-600 mb-4">Your job application has been received and will be reviewed shortly.</p>
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
            <CardTitle>Arriv Estate Media LLC Media Partner Application</CardTitle>
            <CardDescription>Submit your application with your SSN and portfolio samples</CardDescription>
          </CardHeader>
          <CardContent>
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
                    type="url"
                    name="linkedin"
                    value={formData.linkedin}
                    onChange={handleInputChange}
                    required
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Portfolio Link *</label>
                  <Input
                    type="url"
                    name="portfolioLink"
                    value={formData.portfolioLink}
                    onChange={handleInputChange}
                    required
                    placeholder="https://yourportfolio.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Related Job/Experience *</label>
                  <textarea
                    name="lastRelatedJob"
                    value={formData.lastRelatedJob}
                    onChange={handleInputChange}
                    required
                    placeholder="Describe your most recent relevant job experience..."
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
                    placeholder="Tell us why you think you would be an excellent Media Partner..."
                    className="w-full p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    rows="4"
                  />
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    name="backgroundCheckAgreed"
                    checked={formData.backgroundCheckAgreed}
                    onChange={handleInputChange}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    id="bgCheck"
                  />
                  <label htmlFor="bgCheck" className="text-xs text-slate-700 leading-relaxed">
                    I hereby authorize Arriv Estate Media LLC and its designees to conduct a comprehensive background check, including but not limited to criminal history, employment verification, and financial history. I understand that any misrepresentation or omission of material facts may result in immediate termination of this application or any resulting employment. I acknowledge that this authorization is valid for one year from the date hereof.
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Social Security Number (Full) *</label>
                  <Input
                    type="password"
                    name="ssn"
                    value={formData.ssn}
                    onChange={handleInputChange}
                    required
                    placeholder="XXX-XX-XXXX"
                    maxLength="11"
                  />
                  <p className="text-xs text-slate-500 mt-1">Only the last 4 digits will be stored</p>
                </div>
              </div>

              {/* File Uploads */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Portfolio</h3>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Video Samples</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 transition-colors">
                    <input
                      type="file"
                      multiple
                      accept="video/*"
                      onChange={handleVideoUpload}
                      className="hidden"
                      id="video-input"
                    />
                    <label htmlFor="video-input" className="cursor-pointer block">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-700 font-medium">Click to upload videos</p>
                      <p className="text-xs text-slate-500">MP4, MOV, WebM etc.</p>
                    </label>
                  </div>
                  {videoFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {videoFiles.map((file, idx) => (
                        <p key={idx} className="text-xs text-slate-600">✓ {file.name}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Picture Samples</label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 transition-colors">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePictureUpload}
                      className="hidden"
                      id="picture-input"
                    />
                    <label htmlFor="picture-input" className="cursor-pointer block">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                      <p className="text-sm text-slate-700 font-medium">Click to upload pictures</p>
                      <p className="text-xs text-slate-500">JPG, PNG, WebP etc.</p>
                    </label>
                  </div>
                  {pictureFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {pictureFiles.map((file, idx) => (
                        <p key={idx} className="text-xs text-slate-600">✓ {file.name}</p>
                      ))}
                    </div>
                  )}
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
                disabled={loading || !formData.fullName || !formData.email || !formData.phone || !formData.address || !formData.dob || !formData.ssn || !formData.linkedin || !formData.portfolioLink || !formData.lastRelatedJob || !formData.whyGoodFit || !formData.backgroundCheckAgreed}
                className="w-full bg-slate-900 hover:bg-slate-800"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
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