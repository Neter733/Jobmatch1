import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Uploads a raw file buffer (CV or cover letter) as a private, signed asset —
// never publicly accessible, since these are personal documents.
export async function uploadPrivateFile(buffer, folder, publicId) {
  const base64 = buffer.toString('base64');

  const upload = await cloudinary.uploader.upload(
    `data:application/octet-stream;base64,${base64}`,
    {
      resource_type: 'raw',
      folder,
      public_id: publicId,
      type: 'authenticated'
    }
  );

  return cloudinary.utils.private_download_url(upload.public_id, '', {
    resource_type: 'raw',
    type: 'authenticated'
  });
}
