import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendWelcomeEmail } from '../../shared/brevoWelcomeEmail.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { 
      fullName, 
      email, 
      phone, 
      address, 
      dob, 
      linkedin, 
      portfolioLink, 
      lastRelatedJob, 
      whyGoodFit, 
      race,
      eEOCagreed,
      signature,
      videoUrls = [],
      pictureUrls = [],
      resumeUrl,
      resumeFileName,
      position
    } = body;

    const positionLabel = position || 'Media Specialist';
    const positionValue = position === 'Sales Growth Advisor' ? 'sales_growth_advisor' : 'media_specialist';

    // Get Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Find or create "Job Applications" folder
    const folderQuery = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=name="Job Applications"+and+mimeType="application/vnd.google-apps.folder"+and+trashed=false&spaces=drive&fields=files(id,name)',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    let folderId;
    const folderRes = await folderQuery.json();

    if (folderRes.files && folderRes.files.length > 0) {
      folderId = folderRes.files[0].id;
      console.log('Found existing folder:', folderId);
    } else {
      // Create the folder if it doesn't exist
      const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Job Applications',
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      if (!createFolderRes.ok) {
        const error = await createFolderRes.text();
        console.error('Failed to create folder:', error);
        return Response.json({ error: 'Failed to create application folder' }, { status: 500 });
      }

      const createdFolder = await createFolderRes.json();
      folderId = createdFolder.id;
      console.log('Created new folder:', folderId);
    }

    // Create a text file with application information instead of a Google Doc
    const content = `Arriv Estate Media LLC - ${positionLabel} Application

--- APPLICATION DETAILS ---

Full Name: ${fullName}
Email: ${email}
Phone: ${phone}
Address: ${address}
Date of Birth: ${dob}
LinkedIn: ${linkedin}
Portfolio: ${portfolioLink}

--- MEDIA SAMPLES ---
Video Samples: ${videoUrls.length > 0 ? videoUrls.join('\n') : 'N/A'}
Picture Samples: ${pictureUrls.length > 0 ? pictureUrls.join('\n') : 'N/A'}

--- EXPERIENCE ---

Last Related Job:
${lastRelatedJob}

--- WHY YOU'RE A GOOD FIT ---

${whyGoodFit}

--- AGREEMENTS ---
EEOC Agreement: ${eEOCagreed}
Signature: ${signature}
`;

    // Create a text file in the Job Applications folder
    const fileCreateRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Job Application - ${positionLabel} - ${fullName}.txt`,
        mimeType: 'text/plain',
        parents: [folderId],
      }),
    });

    let fileId;
    let fileLink;
    if (fileCreateRes.ok) {
      const fileData = await fileCreateRes.json();
      fileId = fileData.id;
      fileLink = fileData.webViewLink;
      console.log('File created in folder:', fileId);

      // Upload the file content
      const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'text/plain',
        },
        body: content,
      });

      if (uploadRes.ok) {
        console.log('File content uploaded successfully');
      } else {
        const error = await uploadRes.text();
        console.error('Failed to upload file content:', error);
      }
    } else {
      const error = await fileCreateRes.text();
      console.error('Failed to create file:', error);
      return Response.json({ error: 'Failed to create application file' }, { status: 500 });
    }

    // Upload resume file into the same folder (if provided)
    let resumeFileId;
    let resumeFileLink;
    if (resumeUrl) {
      try {
        const resumeRes = await fetch(resumeUrl);
        if (resumeRes.ok) {
          const resumeBytes = new Uint8Array(await resumeRes.arrayBuffer());
          const resumeName = resumeFileName || `Resume - ${fullName}`;
          const ext = resumeName.toLowerCase().split('.').pop() || '';
          let mt = 'application/octet-stream';
          if (ext === 'pdf') mt = 'application/pdf';
          else if (ext === 'doc') mt = 'application/msword';
          else if (ext === 'docx') mt = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          else if (ext === 'txt') mt = 'text/plain';
          const metadata = JSON.stringify({ name: resumeName, parents: [folderId] });
          const boundary = 'arriv_boundary_' + Math.random().toString(36).slice(2);
          const pre = new TextEncoder().encode(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mt}\r\n\r\n`
          );
          const post = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
          const merged = new Uint8Array(pre.length + resumeBytes.length + post.length);
          merged.set(pre, 0);
          merged.set(resumeBytes, pre.length);
          merged.set(post, pre.length + resumeBytes.length);
          const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: merged,
          });
          if (uploadRes.ok) {
            const upData = await uploadRes.json();
            resumeFileId = upData.id;
            resumeFileLink = upData.webViewLink;
            console.log('Resume uploaded to folder:', resumeFileId);
          } else {
            const err = await uploadRes.text();
            console.error('Failed to upload resume:', err);
          }
        } else {
          console.error('Failed to fetch resume file:', resumeRes.status);
        }
      } catch (resumeErr) {
        console.error('Failed to fetch/upload resume:', resumeErr.message);
      }
    }

    // Create job application record
    const application = await base44.entities.JobApplication.create({
      full_name: fullName,
      email,
      phone,
      address,
      dob,
      linkedin,
      portfolio_link: portfolioLink,
      last_related_job: lastRelatedJob,
      why_good_fit: whyGoodFit,
      race: race || '',
      eeoc_agreed: eEOCagreed,
      signature,
      video_samples: videoUrls,
      picture_samples: pictureUrls,
      position: positionValue,
    });

    // Notify admin by text about the new application
    try {
      const adminPhone = Deno.env.get('ADMIN_PHONE');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      if (adminPhone && twilioPhone && accountSid && authToken) {
        const smsBody = `New ${positionLabel} application received: ${fullName} (${email}). Review it in the Arriv dashboard.`;
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: twilioPhone, To: adminPhone, Body: smsBody }).toString(),
        });
      }
    } catch (smsError) {
      console.error('Failed to send admin SMS notification:', smsError.message);
    }

    // Send welcome email to the applicant via Brevo (non-blocking on failure)
    try {
      await sendWelcomeEmail(email, fullName);
    } catch (welcomeErr) {
      console.error('Failed to send applicant welcome email:', welcomeErr.message);
    }

    return Response.json({ 
      success: true, 
      applicationId: application.id,
      fileId: fileId,
      fileLink: fileLink,
      resumeFileId: resumeFileId,
      resumeFileLink: resumeFileLink
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});