import Foundation
import CoreLocation

/// Utility for Geohashing (Base32)
/// Used for scalable spatial queries in Firestore
struct GeohashUtils {
    private static let base32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    
    /// Encode a coordinate into a geohash string
    /// - Parameters:
    ///   - latitude: Latitude in degrees
    ///   - longitude: Longitude in degrees
    ///   - precision: Length of the geohash (default 9, ~5m accuracy)
    /// - Returns: Geohash string
    static func encode(latitude: Double, longitude: Double, precision: Int = 9) -> String {
        var minLat = -90.0, maxLat = 90.0
        var minLon = -180.0, maxLon = 180.0
        var geohash = ""
        var isEven = true
        var bit = 0
        var ch = 0
        
        while geohash.count < precision {
            var mid = 0.0
            if isEven {
                mid = (minLon + maxLon) / 2
                if longitude >= mid {
                    ch |= (1 << (4 - bit))
                    minLon = mid
                } else {
                    maxLon = mid
                }
            } else {
                mid = (minLat + maxLat) / 2
                if latitude >= mid {
                    ch |= (1 << (4 - bit))
                    minLat = mid
                } else {
                    maxLat = mid
                }
            }
            
            isEven.toggle()
            if bit < 4 {
                bit += 1
            } else {
                let index = base32.index(base32.startIndex, offsetBy: ch)
                geohash.append(base32[index])
                bit = 0
                ch = 0
            }
        }
        return geohash
    }
}
