import { useState, useEffect } from 'react';

const useMapState = (initialState) => {
    const [mapState, setMapState] = useState(initialState);

    const updateVisibility = (visibility) => {
        setMapState((prevState) => ({ ...prevState, visible: visibility }));
    };

    const updatePlayerPosition = (position) => {
        setMapState((prevState) => ({ ...prevState, playerPosition: position }));
    };

    useEffect(() => {
        // Any side effects or subscriptions can go here
    }, [mapState]);

    return { mapState, updateVisibility, updatePlayerPosition };
};

export default useMapState;
