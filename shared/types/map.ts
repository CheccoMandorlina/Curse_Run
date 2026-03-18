// Type definition for map types

type MapType = {
    id: string;
    name: string;
    description?: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
};

export default MapType;