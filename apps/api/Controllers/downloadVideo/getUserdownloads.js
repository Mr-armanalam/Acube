import User from '../../Models/Auth.js';
import { paginateArray, paginationOf } from "../../utils/pagination.js";

export const getUserDownloads = async (req, res) => {
    const userId = req.userid;
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Phase 3b: paginated. The `downloads` key keeps its old name so
        // existing clients keep working; page/limit/total/totalPages are
        // added alongside it.
        const page = paginateArray(user.downloads ?? [], paginationOf(req));
        return res.status(200).json({
          success: true,
          downloads: page.items,
          page: page.page,
          limit: page.limit,
          total: page.total,
          totalPages: page.totalPages,
        });
    } catch (error) {
        console.error('Error fetching user downloads:', error);
        return res.status(500).json({ success: false, message: 'Error fetching user downloads' });
    }
};
