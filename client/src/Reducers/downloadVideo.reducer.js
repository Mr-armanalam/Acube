const initialState = {
    isPremium: false,
    downloads: [],
};

const downloadVideoReducer = (state = initialState, action) => {
    switch (action.type) {
        case 'CHECK_PREMIUM_STATUS':
            return { ...state, isPremium: action.payload };
        case 'GET_DOWNLOADS':
            return { ...state, downloads: action.payload };
        case 'VIDEO_DOWNLOADED':
            return { ...state, downloads: [...state.downloads, action.payload] };
        default:
            return state;
    }
};

export default downloadVideoReducer;
