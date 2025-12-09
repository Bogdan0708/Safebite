import Foundation
import SwiftData

/// A report of a gluten contamination incident at a restaurant
@Model
final class IncidentReport {
    @Attribute(.unique) var id: String

    // MARK: - Incident Details
    var description: String
    var dateOfIncident: Date
    var severity: ReactionSeverity
    var symptomsExperienced: [String]

    // MARK: - What Was Ordered
    var itemsOrdered: [String]
    var suspectedItem: String?
    var wasItemLabeledGF: Bool

    // MARK: - Restaurant Response
    var wasStaffNotified: Bool
    var staffResponse: String?
    var wasManagerInvolved: Bool

    // MARK: - Follow-up
    var hasRestaurantResponded: Bool
    var restaurantResponseText: String?
    var restaurantResponseDate: Date?
    var isResolved: Bool
    var resolutionDescription: String?

    // MARK: - Evidence
    var photoURLs: [String]
    var hasReceiptPhoto: Bool

    // MARK: - Reporter Info
    var reporterId: String
    var reporterSeverityLevel: GlutenSeverityLevel
    var isAnonymous: Bool

    // MARK: - Metadata
    var reportedAt: Date
    var updatedAt: Date
    var verifiedByModerator: Bool
    var moderatorNotes: String?

    // MARK: - Relationship
    var restaurant: Restaurant?

    init(
        id: String = UUID().uuidString,
        description: String,
        dateOfIncident: Date,
        severity: ReactionSeverity,
        symptomsExperienced: [String] = [],
        itemsOrdered: [String] = [],
        suspectedItem: String? = nil,
        wasItemLabeledGF: Bool = true,
        wasStaffNotified: Bool = false,
        reporterId: String,
        reporterSeverityLevel: GlutenSeverityLevel,
        isAnonymous: Bool = false
    ) {
        self.id = id
        self.description = description
        self.dateOfIncident = dateOfIncident
        self.severity = severity
        self.symptomsExperienced = symptomsExperienced
        self.itemsOrdered = itemsOrdered
        self.suspectedItem = suspectedItem
        self.wasItemLabeledGF = wasItemLabeledGF
        self.wasStaffNotified = wasStaffNotified
        self.reporterId = reporterId
        self.reporterSeverityLevel = reporterSeverityLevel
        self.isAnonymous = isAnonymous

        // Defaults
        self.hasRestaurantResponded = false
        self.isResolved = false
        self.photoURLs = []
        self.hasReceiptPhoto = false
        self.wasManagerInvolved = false
        self.reportedAt = Date()
        self.updatedAt = Date()
        self.verifiedByModerator = false
    }
}

// MARK: - Common Symptoms

struct CommonSymptoms {
    static let all: [String] = [
        "Bloating",
        "Abdominal pain",
        "Diarrhea",
        "Constipation",
        "Nausea",
        "Vomiting",
        "Fatigue",
        "Headache",
        "Brain fog",
        "Joint pain",
        "Skin rash",
        "Mouth ulcers",
        "Anxiety",
        "Depression",
        "Other"
    ]

    static let severe: [String] = [
        "Severe abdominal pain",
        "Persistent vomiting",
        "Unable to keep fluids down",
        "Required medical attention",
        "ER visit",
        "Hospitalization"
    ]
}

// MARK: - Incident Extensions

extension IncidentReport {
    /// Whether this incident is recent (within 6 months)
    var isRecent: Bool {
        dateOfIncident > Calendar.current.date(byAdding: .month, value: -6, to: Date())!
    }

    /// Impact score for trust calculation (higher = more impact)
    var impactScore: Int {
        var score = 0

        // Base severity score
        switch severity {
        case .mild: score += 1
        case .moderate: score += 3
        case .severe: score += 5
        }

        // Recency multiplier
        if isRecent { score += 2 }

        // Verified adds weight
        if verifiedByModerator { score += 1 }

        // Unresolved adds weight
        if !isResolved { score += 1 }

        return score
    }

    /// Display-friendly date
    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: dateOfIncident)
    }

    /// Status for display
    var status: IncidentStatus {
        if isResolved {
            return .resolved
        } else if hasRestaurantResponded {
            return .responded
        } else {
            return .open
        }
    }
}

enum IncidentStatus: String {
    case open = "Open"
    case responded = "Restaurant Responded"
    case resolved = "Resolved"

    var color: String {
        switch self {
        case .open: return "red"
        case .responded: return "orange"
        case .resolved: return "green"
        }
    }

    var icon: String {
        switch self {
        case .open: return "exclamationmark.circle.fill"
        case .responded: return "message.circle.fill"
        case .resolved: return "checkmark.circle.fill"
        }
    }
}

// MARK: - Incident Summary

struct IncidentSummary {
    let totalIncidents: Int
    let recentIncidents: Int
    let unresolvedIncidents: Int
    let averageSeverity: Double

    init(incidents: [IncidentReport]) {
        self.totalIncidents = incidents.count
        self.recentIncidents = incidents.filter { $0.isRecent }.count
        self.unresolvedIncidents = incidents.filter { !$0.isResolved }.count

        if incidents.isEmpty {
            self.averageSeverity = 0
        } else {
            let severityScores = incidents.map { incident -> Double in
                switch incident.severity {
                case .mild: return 1
                case .moderate: return 2
                case .severe: return 3
                }
            }
            self.averageSeverity = severityScores.reduce(0, +) / Double(incidents.count)
        }
    }

    var hasRecentIssues: Bool {
        recentIncidents > 0
    }
}
