import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function AdminClientTerms() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then((userData) => {
      if (userData?.role !== "admin") {
        window.location.href = "/";
      }
      setUser(userData);
    });
  }, []);

  const { data: signedTerms = [], isLoading } = useQuery({
    queryKey: ["client-signed-terms"],
    queryFn: () => base44.entities.ClientSignedTerms.list("-signed_date", 100),
  });

  const handleDownload = async (fileUri, clientName) => {
    try {
      const signedUrl = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: fileUri
      });

      const link = document.createElement("a");
      link.href = signedUrl.signed_url;
      link.download = `${clientName}_signed_terms.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("PDF downloaded successfully");
    } catch (error) {
      toast.error("Failed to download PDF");
      console.error(error);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-800">Access denied. Admin only.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Client Signed Terms
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            View and download client signed terms agreements
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-[var(--text-secondary)]">Loading documents...</p>
            </CardContent>
          </Card>
        ) : signedTerms.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-[var(--text-secondary)]">No signed client terms documents yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {signedTerms.map((record) => (
              <Card
                key={record.id}
                className="border-[var(--border-color)] bg-[var(--card-bg)] hover:shadow-lg transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#B8956A]/10 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-[#B8956A]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-[var(--text-primary)]">
                          {record.client_name}
                        </CardTitle>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {record.client_email}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        handleDownload(record.document_url, record.client_name)
                      }
                      className="bg-[#B8956A] hover:bg-[#A68559] text-white gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Signed on {format(new Date(record.signed_date), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}