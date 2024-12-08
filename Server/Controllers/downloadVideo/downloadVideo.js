import User from '../../Models/Auth.js';

export const downloadvideo = async (req, res) => {
    const userId = req.userid;
    try { const user = await User.findById(userId); 
        if (!user.isPremium && user.downloadsToday >= 1) {
            return res.status(403).json({ success: false, message: 'Daily download limit reached. Upgrade to premium for unlimited downloads.' }); 
        } 
            
        user.downloadsToday += 1; 
        user.lastReset = Date.now();
        user.downloads.push({ title: 'Video Title', date: new Date() }); 
        await user.save(); 
        
        return res.status(200).json({ success: true, video: { title: 'Video Title' } }); 
    } catch (error) { 
        console.error('Error downloading video:', error);
        return res.status(500).json({ success: false, message: 'Error downloading video' }); 
    } 
};