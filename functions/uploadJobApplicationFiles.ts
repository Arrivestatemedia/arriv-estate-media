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
    const ssn = formData.get('ssn');

    // Get Google Drive access token
    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    const uploadedVideos = [];
    const uploadedPictures = [];

    // Upload video files
    for (const videoFile of videoFiles) {
      const bytes = await videoFile.arrayBuffer();
      const blob = new Blob([bytes], { type: videoFile.type });
      
      const uploadFormData = new FormData();
      uploadFormData.append('file', blob, videoFile.name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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
      uploadFormData.append('file', blob, pictureFile.name);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
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
      ssn: ssn.slice(-4),
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