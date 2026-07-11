export interface MedicalFacility {
  id?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  phone?: string | null;
  type: string;
  distance_meters?: number | null;
}

export interface NearbyHospitalsResponse {
  facilities: MedicalFacility[];
  count: number;
}
