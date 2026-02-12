import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Create Google Doc with application information
    const docCreateRes = await fetch('https://docs.googleapis.com/v1/documents?fields=documentId', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: `Job Application - ${fullName}`,
        body: {
          content: [
            {
              paragraph: {
                text: `Arriv Estate Media LLC - Media Partner Application\n${fullName}`,
              },
            },
          ],
        },
      }),
    });

    let documentId;
    if (docCreateRes.ok) {
      const docData = await docCreateRes.json();
      documentId = docData.documentId;
      console.log('Google Doc created:', documentId);

      // Add content to the document
      const batchUpdateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                text: `\n\n--- APPLICATION DETAILS ---\n\nFull Name: ${fullName}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nDate of Birth: ${dob}\nSSN (Last 4): ${ssn.slice(-4)}\nLinkedIn: ${linkedin}\nPortfolio: ${portfolioLink}\n\n--- MEDIA SAMPLES ---\nVideo Samples: ${videoUrls.length > 0 ? videoUrls.join('\n') : 'N/A'}\nPicture Samples: ${pictureUrls.length > 0 ? pictureUrls.join('\n') : 'N/A'}\n\n--- EXPERIENCE ---\n\nLast Related Job:\n${lastRelatedJob}\n\n--- WHY YOU'RE A GOOD FIT ---\n\n${whyGoodFit}`,
              },
            },
          ],
        }),
      });

      if (batchUpdateRes.ok) {
        // Move document to Job Applications folder
        const moveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}?addParents=${folderId}&fields=id,parents`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (moveRes.ok) {
          console.log('Document moved to folder successfully');
        } else {
          const error = await moveRes.text();
          console.error('Failed to move document to folder:', error);
        }
      } else {
        const error = await batchUpdateRes.text();
        console.error('Batch update failed:', error);
      }
    } else {
      const error = await docCreateRes.text();
      console.error('Failed to create Google Doc:', error);
      return Response.json({ error: 'Failed to create application document' }, { status: 500 });
    }

    // Create job application record
    const application = await base44.entities.JobApplication.create({
      full_name: fullName,
      email,
      phone,
      address,
      dob,
      ssn: ssn.slice(-4),
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

    return Response.json({ 
      success: true, 
      applicationId: application.id,
      documentId: documentId
    });
  } catch (error) {
    console.error('Upload error:', error);
    return Response.json({ error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
});