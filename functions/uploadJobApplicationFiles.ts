import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const videoFiles = formData.getAll('videos');
    const pictureFiles = formData.getAll('pictures');
    const fullName = formData.get('fullName');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const address = formData.get('address');
    const ssn = formData.get('ssn');
    const linkedin = formData.get('linkedin');
    const portfolioLink = formData.get('portfolioLink');
    const lastRelatedJob = formData.get('lastRelatedJob');
    const whyGoodFit = formData.get('whyGoodFit');

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

      const createdFolder = await createFolderRes.json();
      folderId = createdFolder.id;
    }

    const uploadedVideos = [];
    const uploadedPictures = [];

    // Upload video files
    for (const videoFile of videoFiles) {
      const bytes = await videoFile.arrayBuffer();
      const blob = new Blob([bytes], { type: videoFile.type });
      
      const uploadFormData = new FormData();
      uploadFormData.append('metadata', new Blob([JSON.stringify({
        name: videoFile.name,
        parents: [folderId],
      })], { type: 'application/json' }));
      uploadFormData.append('file', blob, videoFile.name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: uploadFormData,
      });

      if (uploadRes.ok) {
        const uploadedFile = await uploadRes.json();
        uploadedVideos.push(uploadedFile.id);
      }
    }

    // Upload picture files
    for (const pictureFile of pictureFiles) {
      const bytes = await pictureFile.arrayBuffer();
      const blob = new Blob([bytes], { type: pictureFile.type });
      
      const uploadFormData = new FormData();
      uploadFormData.append('metadata', new Blob([JSON.stringify({
        name: pictureFile.name,
        parents: [folderId],
      })], { type: 'application/json' }));
      uploadFormData.append('file', blob, pictureFile.name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: uploadFormData,
      });

      if (uploadRes.ok) {
        const uploadedFile = await uploadRes.json();
        uploadedPictures.push(uploadedFile.id);
      }
    }

    // Create job application record
    const application = await base44.entities.JobApplication.create({
      full_name: fullName,
      email,
      phone,
      address,
      ssn: ssn.slice(-4),
      linkedin,
      portfolio_link: portfolioLink,
      last_related_job: lastRelatedJob,
      why_good_fit: whyGoodFit,
      video_samples: uploadedVideos,
      picture_samples: uploadedPictures,
    });

    return Response.json({ 
      success: true, 
      applicationId: application.id,
      videoCount: uploadedVideos.length,
      pictureCount: uploadedPictures.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});