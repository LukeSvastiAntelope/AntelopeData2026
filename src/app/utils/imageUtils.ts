import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Downloads an image from a URL and saves it to the public/avatar directory
 * @param imageUrl - The URL of the image to download (e.g., DALL-E URL)
 * @param userId - The user ID for naming the file
 * @returns The local path to the saved image
 */
export async function downloadAndSaveImage(imageUrl: string, userId: string | number): Promise<string> {
    try {
        // Skip if it's already a local URL
        if (imageUrl.startsWith('/') || imageUrl.includes('localhost') || imageUrl.includes(process.env.NEXT_PUBLIC_APP_URL || '')) {
            return imageUrl;
        }

        // Skip if it's a DiceBear URL (these are reliable and don't expire)
        if (imageUrl.includes('dicebear.com')) {
            return imageUrl;
        }

        // Only process DALL-E URLs and other temporary URLs
        if (!imageUrl.includes('oaidalleapiprodscus.blob.core.windows.net') && 
            !imageUrl.includes('openai.com') && 
            !imageUrl.startsWith('data:')) {
            return imageUrl;
        }

        console.log('Downloading image from:', imageUrl);

        // Fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        // Get the image buffer
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Determine file extension from content type or URL
        const contentType = response.headers.get('content-type');
        let extension = 'jpg'; // default
        
        if (contentType) {
            if (contentType.includes('png')) extension = 'png';
            else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg';
            else if (contentType.includes('webp')) extension = 'webp';
        }

        // Generate unique filename
        const filename = `agent_${userId}_${uuidv4()}.${extension}`;
        
        // Ensure the avatar directory exists
        const avatarDir = path.join(process.cwd(), 'public', 'avatar');
        if (!fs.existsSync(avatarDir)) {
            fs.mkdirSync(avatarDir, { recursive: true });
        }

        // Save the file
        const filePath = path.join(avatarDir, filename);
        fs.writeFileSync(filePath, buffer);

        // Return the public URL path
        const publicPath = `/avatar/${filename}`;
        console.log('Image saved successfully to:', publicPath);
        
        return publicPath;
    } catch (error) {
        console.error('Error downloading and saving image:', error);
        // Return a fallback DiceBear avatar if download fails
        return `https://api.dicebear.com/7.x/bottts/svg?seed=agent${userId}`;
    }
}

/**
 * Compresses and saves a base64 image to the avatar directory
 * @param base64Data - The base64 image data
 * @param userId - The user ID for naming the file
 * @returns The local path to the saved image
 */
export async function saveBase64Image(base64Data: string, userId: string | number): Promise<string> {
    try {
        // Remove data URL prefix if present
        const base64Image = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
        
        // Convert base64 to buffer
        const buffer = Buffer.from(base64Image, 'base64');
        
        // Generate unique filename
        const filename = `agent_${userId}_${uuidv4()}.jpg`;
        
        // Ensure the avatar directory exists
        const avatarDir = path.join(process.cwd(), 'public', 'avatar');
        if (!fs.existsSync(avatarDir)) {
            fs.mkdirSync(avatarDir, { recursive: true });
        }

        // Save the file
        const filePath = path.join(avatarDir, filename);
        fs.writeFileSync(filePath, buffer);

        // Return the public URL path
        const publicPath = `/avatar/${filename}`;
        console.log('Base64 image saved successfully to:', publicPath);
        
        return publicPath;
    } catch (error) {
        console.error('Error saving base64 image:', error);
        // Return a fallback DiceBear avatar if save fails
        return `https://api.dicebear.com/7.x/bottts/svg?seed=agent${userId}`;
    }
} 