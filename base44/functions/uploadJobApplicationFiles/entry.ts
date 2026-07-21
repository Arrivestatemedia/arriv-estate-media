import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
      ssn, 
      linkedin, 
      portfolioLink, 
      lastRelatedJob, 
      whyGoodFit, 
      race,
      backgroundCheckAgreed,
      ssnDisclosureAgreed,
      eEOCagreed,
      signature,
      videoUrls = [],
      pictureUrls = []
    } = body;

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
    const content = `Arriv Estate Media LLC - Media Partner Application

--- APPLICATION DETAILS ---

Full Name: ${fullName}
Email: ${email}
Phone: ${phone}
Address: ${address}
Date of Birth: ${dob}
SSN (Last 4): ${ssn.slice(-4)}
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
Background Check Agreed: ${backgroundCheckAgreed}
SSN Disclosure Agreed: ${ssnDisclosureAgreed}
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
        name: `Job Application - ${fullName}.txt`,
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

    // Create job application record
    const application = await base44.entities.JobApplication.create({
      full_name: fullName,
      email,
      phone,
      address,
      dob,
      ssn: ssn,
      linkedin,
      portfolio_link: portfolioLink,
      last_related_job: lastRelatedJob,
      why_good_fit: whyGoodFit,
      race: race || '',
      background_check_agreed: backgroundCheckAgreed,
      ssn_disclosure_agreed: ssnDisclosureAgreed,
      eeoc_agreed: eEOCagreed,
      signature,
      video_samples: videoUrls,
      picture_samples: pictureUrls,
    });

    // Notify admin by text about the new application
    try {
      const adminPhone = Deno.env.get('ADMIN_PHONE');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      if (adminPhone && twilioPhone && accountSid && authToken) {
        const smsBody = `New media specialist application received: ${fullName} (${email}). Review it in the Arriv dashboard.`;
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

    return Response.json({ 
      success: true, 
      applicationId: application.id,
      fileId: fileId,
      fileLink: fileLink
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});