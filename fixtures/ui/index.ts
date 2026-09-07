/**
 * Shared UI test fixtures for Phase 2 snapshot tests.
 *
 * Each fixture returns a fresh object so mutations don't leak between tests.
 * Data shapes align with Prisma models: Item, Card, Identification, ItemPhoto.
 */

export interface UIFixture {
  name: string;
  description: string;
  item: {
    id: string;
    status: string;
    cardId: string | null;
    scanSessionId: string | null;
    sessionSeq: number | null;
    storage: string;
    conditionKind: string;
    [key: string]: unknown;
  };
  card: {
    id: string;
    year: number;
    manufacturer: string;
    setName: string;
    cardNumber: string;
    players: Array<{ name: string; team: string | null; position: string | null }>;
    parallel: string | null;
    [key: string]: unknown;
  } | null;
  identification: {
    status: string;
    flags: string[];
    candidates: unknown[];
    extraction: unknown;
    overallConfidence: number;
    wasReady: boolean;
    estValueMaxCents: number | null;
    [key: string]: unknown;
  } | null;
  photos: Array<{ id: string; side: string; gcsPath: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(n: number): string {
  return `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

function photo(itemIndex: number, side: "front" | "back" = "front"): {
  id: string;
  side: string;
  gcsPath: string;
} {
  return {
    id: uid(itemIndex * 100 + (side === "front" ? 1 : 2)),
    side,
    gcsPath: `scans/2026/09/${uid(itemIndex)}_${side}.webp`,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export function confidentMatch(): UIFixture {
  return {
    name: "confidentMatch",
    description: "State A: wasReady true, one candidate at 0.92, no blocking flags",
    item: {
      id: uid(1),
      status: "owned",
      cardId: uid(1001),
      scanSessionId: uid(5001),
      sessionSeq: 1,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: {
      id: uid(1001),
      year: 2026,
      manufacturer: "Topps",
      setName: "2026 Topps Flagship Series 1",
      cardNumber: "127",
      players: [{ name: "Marcus Hargrove", team: "Chicago Cubs", position: "SS" }],
      parallel: null,
    },
    identification: {
      status: "confirmed",
      flags: [],
      candidates: [
        {
          cardId: uid(1001),
          confidence: 0.92,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Topps",
        setName: "2026 Topps Flagship Series 1",
        cardNumber: "127",
        player: "Marcus Hargrove",
      },
      overallConfidence: 0.92,
      wasReady: true,
      estValueMaxCents: 25000,
    },
    photos: [photo(1, "front"), photo(1, "back")],
  };
}

export function uncertainParallel(): UIFixture {
  return {
    name: "uncertainParallel",
    description: "State B: parallel_uncertain flag, two candidates",
    item: {
      id: uid(2),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 2,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "needs_review",
      flags: ["parallel_uncertain"],
      candidates: [
        {
          cardId: uid(1002),
          confidence: 0.74,
          parallel: null,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
        {
          cardId: uid(1003),
          confidence: 0.68,
          parallel: "Gold /2026",
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Topps",
        setName: "2026 Topps Flagship Series 1",
        cardNumber: "44",
        player: "Deshawn Calloway",
      },
      overallConfidence: 0.74,
      wasReady: false,
      estValueMaxCents: 180000,
    },
    photos: [photo(2, "front"), photo(2, "back")],
  };
}

export function notInCatalog(): UIFixture {
  return {
    name: "notInCatalog",
    description: "State C: no_catalog_match flag, no candidates, extraction has player/year/cardNumber",
    item: {
      id: uid(3),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 3,
      storage: "penny_sleeve",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "needs_review",
      flags: ["no_catalog_match"],
      candidates: [],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Panini",
        setName: "2026 Panini Prizm Draft Picks",
        cardNumber: "RC-18",
        player: "Tyrese Jameson",
      },
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
    },
    photos: [photo(3, "front"), photo(3, "back")],
  };
}

export function notInCatalogPartialExtraction(): UIFixture {
  return {
    name: "notInCatalogPartialExtraction",
    description: "State C: extraction has player only, year and cardNumber null",
    item: {
      id: uid(4),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 4,
      storage: "penny_sleeve",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "needs_review",
      flags: ["no_catalog_match"],
      candidates: [],
      extraction: {
        kind: "card",
        year: null,
        manufacturer: null,
        setName: null,
        cardNumber: null,
        player: "Tyrese Jameson",
      },
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
    },
    photos: [photo(4, "front")],
  };
}

export function notInCatalogNoExtraction(): UIFixture {
  return {
    name: "notInCatalogNoExtraction",
    description: "State C: extraction has all nulls",
    item: {
      id: uid(5),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 5,
      storage: "unknown",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "needs_review",
      flags: ["no_catalog_match"],
      candidates: [],
      extraction: {
        kind: "card",
        year: null,
        manufacturer: null,
        setName: null,
        cardNumber: null,
        player: null,
      },
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
    },
    photos: [photo(5, "front")],
  };
}

export function notACard(): UIFixture {
  return {
    name: "notACard",
    description: "Extraction kind is not_a_card",
    item: {
      id: uid(6),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 6,
      storage: "unknown",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "needs_review",
      flags: [],
      candidates: [],
      extraction: {
        kind: "not_a_card",
      },
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
    },
    photos: [photo(6, "front")],
  };
}

export function identifyFailed(): UIFixture {
  return {
    name: "identifyFailed",
    description: "Identification status failed, provider_unavailable",
    item: {
      id: uid(7),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 7,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "failed",
      flags: [],
      candidates: [],
      extraction: null,
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
      failureReason: "provider_unavailable",
    },
    photos: [photo(7, "front"), photo(7, "back")],
  };
}

export function identifyFailedQuota(): UIFixture {
  return {
    name: "identifyFailedQuota",
    description: "Identification failed due to quota_exhausted",
    item: {
      id: uid(8),
      status: "needs_review",
      cardId: null,
      scanSessionId: uid(5001),
      sessionSeq: 8,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: null,
    identification: {
      status: "failed",
      flags: [],
      candidates: [],
      extraction: null,
      overallConfidence: 0,
      wasReady: false,
      estValueMaxCents: null,
      failureReason: "quota_exhausted",
    },
    photos: [photo(8, "front")],
  };
}

export function redemption(): UIFixture {
  return {
    name: "redemption",
    description: "Card with redemption flag",
    item: {
      id: uid(9),
      status: "owned",
      cardId: uid(1009),
      scanSessionId: uid(5001),
      sessionSeq: 9,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: {
      id: uid(1009),
      year: 2026,
      manufacturer: "Topps",
      setName: "2026 Topps Flagship Series 1",
      cardNumber: "RDC-5",
      players: [{ name: "Jordan Whitfield", team: "New York Yankees", position: "CF" }],
      parallel: null,
    },
    identification: {
      status: "confirmed",
      flags: ["redemption"],
      candidates: [
        {
          cardId: uid(1009),
          confidence: 0.88,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Topps",
        setName: "2026 Topps Flagship Series 1",
        cardNumber: "RDC-5",
        player: "Jordan Whitfield",
      },
      overallConfidence: 0.88,
      wasReady: true,
      estValueMaxCents: 50000,
    },
    photos: [photo(9, "front")],
  };
}

export function incompleteScanDraft(): UIFixture {
  return {
    name: "incompleteScanDraft",
    description: "Item status draft, no identification yet",
    item: {
      id: uid(10),
      status: "draft",
      cardId: null,
      scanSessionId: uid(5002),
      sessionSeq: 1,
      storage: "unknown",
      conditionKind: "raw",
    },
    card: null,
    identification: null,
    photos: [photo(10, "front")],
  };
}

export function longNameCard(): UIFixture {
  return {
    name: "longNameCard",
    description: "Very long player name and set name for truncation testing",
    item: {
      id: uid(11),
      status: "owned",
      cardId: uid(1011),
      scanSessionId: uid(5001),
      sessionSeq: 11,
      storage: "magnetic",
      conditionKind: "raw",
    },
    card: {
      id: uid(1011),
      year: 2026,
      manufacturer: "Panini",
      setName:
        "2026 Panini Prizm Draft Picks Collegiate Champions Redemption Series Mega Box Exclusive",
      cardNumber: "CCRS-247",
      players: [
        {
          name: "Christopher Alexander Bartholomew Rodriguez-Williamson III",
          team: "Los Angeles Dodgers",
          position: "1B",
        },
      ],
      parallel: "Hyper Prizm Mojo Refractor Shimmer Gold Wave /10",
    },
    identification: {
      status: "confirmed",
      flags: [],
      candidates: [
        {
          cardId: uid(1011),
          confidence: 0.91,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Panini",
        setName:
          "2026 Panini Prizm Draft Picks Collegiate Champions Redemption Series Mega Box Exclusive",
        cardNumber: "CCRS-247",
        player: "Christopher Alexander Bartholomew Rodriguez-Williamson III",
      },
      overallConfidence: 0.91,
      wasReady: true,
      estValueMaxCents: 420000,
    },
    photos: [photo(11, "front"), photo(11, "back")],
  };
}

export function itemNoPhoto(): UIFixture {
  return {
    name: "itemNoPhoto",
    description: "Item with empty photos array",
    item: {
      id: uid(12),
      status: "draft",
      cardId: null,
      scanSessionId: uid(5002),
      sessionSeq: 2,
      storage: "unknown",
      conditionKind: "raw",
    },
    card: null,
    identification: null,
    photos: [],
  };
}

export function unpricedItem(): UIFixture {
  return {
    name: "unpricedItem",
    description: "Owned item with confirmed identity but no valuation data",
    item: {
      id: uid(13),
      status: "owned",
      cardId: uid(1013),
      scanSessionId: uid(5001),
      sessionSeq: 13,
      storage: "toploader",
      conditionKind: "raw",
    },
    card: {
      id: uid(1013),
      year: 2026,
      manufacturer: "Topps",
      setName: "2026 Topps Flagship Series 1",
      cardNumber: "312",
      players: [{ name: "Emilio Vega", team: "Miami Marlins", position: "2B" }],
      parallel: null,
    },
    identification: {
      status: "confirmed",
      flags: [],
      candidates: [
        {
          cardId: uid(1013),
          confidence: 0.95,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year: 2026,
        manufacturer: "Topps",
        setName: "2026 Topps Flagship Series 1",
        cardNumber: "312",
        player: "Emilio Vega",
      },
      overallConfidence: 0.95,
      wasReady: true,
      estValueMaxCents: null,
    },
    photos: [photo(13, "front"), photo(13, "back")],
  };
}

export function emptyCollection(): UIFixture {
  return {
    name: "emptyCollection",
    description: "Marker fixture representing an empty collection (no item/card data)",
    item: {
      id: uid(14),
      status: "draft",
      cardId: null,
      scanSessionId: null,
      sessionSeq: null,
      storage: "unknown",
      conditionKind: "raw",
    },
    card: null,
    identification: null,
    photos: [],
  };
}

export function batchSameSet40(): UIFixture {
  const setName = "2026 Topps Flagship Series 1";
  const manufacturer = "Topps";
  const year = 2026;

  const playerNames = [
    "Marcus Hargrove", "Deshawn Calloway", "Tyrese Jameson", "Jordan Whitfield",
    "Emilio Vega", "Kenji Nakamura", "Andre Dupont", "Carlos Mendoza",
    "Brandon Kowalski", "Isaiah Thompson", "Liam O'Brien", "Xavier Reeves",
    "Dominic Palermo", "Trevor Lundqvist", "Malik Jefferson", "Ryan Tanaka",
    "Colton Bridges", "Devontae Harris", "Nathan Sorensen", "Alejandro Cruz",
    "Jaylen Morris", "Patrick Gallagher", "Ezekiel Okonkwo", "Bryce Hammond",
    "Tanner McAllister", "Rashid Al-Farsi", "Derek Crenshaw", "Austin Petrovic",
    "Micah Ellsworth", "Cedric Fontaine", "Hugo Castellano", "Dalton Kingsley",
    "Reggie Thornton", "Cameron Ashford", "Nolan Prescott", "Fabian Ochoa",
    "Wesley Drummond", "Kai Matsumoto", "Terrence Caldwell", "Griffin Beaumont",
  ];

  const teams = [
    "Chicago Cubs", "New York Yankees", "Los Angeles Dodgers", "Atlanta Braves",
    "Miami Marlins", "San Diego Padres", "Houston Astros", "Boston Red Sox",
    "San Francisco Giants", "Philadelphia Phillies", "Toronto Blue Jays",
    "Minnesota Twins", "Tampa Bay Rays", "Seattle Mariners", "Cleveland Guardians",
    "St. Louis Cardinals", "Baltimore Orioles", "Texas Rangers", "Detroit Tigers",
    "Milwaukee Brewers", "Arizona Diamondbacks", "Colorado Rockies",
    "Pittsburgh Pirates", "Kansas City Royals", "Oakland Athletics",
    "Cincinnati Reds", "Washington Nationals", "Chicago White Sox",
    "Los Angeles Angels", "New York Mets", "Atlanta Braves", "Miami Marlins",
    "San Diego Padres", "Houston Astros", "Boston Red Sox", "San Francisco Giants",
    "Philadelphia Phillies", "Toronto Blue Jays", "Minnesota Twins", "Tampa Bay Rays",
  ];

  // Mix of states: first 20 owned+confirmed, next 10 needs_review, last 10 draft
  const items: UIFixture["item"][] = [];
  const statuses = [
    ...Array(20).fill("owned" as const),
    ...Array(10).fill("needs_review" as const),
    ...Array(10).fill("draft" as const),
  ];

  for (let i = 0; i < 40; i++) {
    items.push({
      id: uid(4000 + i),
      status: statuses[i],
      cardId: statuses[i] === "owned" ? uid(6000 + i) : null,
      scanSessionId: uid(5003),
      sessionSeq: i + 1,
      storage: "toploader",
      conditionKind: "raw",
    });
  }

  // Return the first item as representative; the `batchItems` key carries all 40
  return {
    name: "batchSameSet40",
    description: "40 items sharing one set, mixed states (20 owned, 10 needs_review, 10 draft)",
    item: items[0],
    card: {
      id: uid(6000),
      year,
      manufacturer,
      setName,
      cardNumber: "1",
      players: [{ name: playerNames[0], team: teams[0], position: "SS" }],
      parallel: null,
    },
    identification: {
      status: "confirmed",
      flags: [],
      candidates: [
        {
          cardId: uid(6000),
          confidence: 0.93,
          matchedFields: ["year", "manufacturer", "setName", "cardNumber", "player"],
        },
      ],
      extraction: {
        kind: "card",
        year,
        manufacturer,
        setName,
        cardNumber: "1",
        player: playerNames[0],
      },
      overallConfidence: 0.93,
      wasReady: true,
      estValueMaxCents: 15000,
    },
    photos: [photo(4000, "front")],
    batchItems: items.map((item, i) => ({
      item,
      card:
        item.status === "owned"
          ? {
              id: uid(6000 + i),
              year,
              manufacturer,
              setName,
              cardNumber: String(i + 1),
              players: [{ name: playerNames[i], team: teams[i], position: "OF" }],
              parallel: null,
            }
          : null,
      identification:
        item.status !== "draft"
          ? {
              status: item.status === "owned" ? "confirmed" : "needs_review",
              flags: item.status === "needs_review" ? ["parallel_uncertain"] : [],
              candidates:
                item.status === "owned"
                  ? [{ cardId: uid(6000 + i), confidence: 0.9 + Math.round(Math.random() * 5) / 100 }]
                  : [
                      { cardId: uid(6000 + i), confidence: 0.65 },
                      { cardId: uid(6100 + i), confidence: 0.58 },
                    ],
              extraction: {
                kind: "card",
                year,
                manufacturer,
                setName,
                cardNumber: String(i + 1),
                player: playerNames[i],
              },
              overallConfidence: item.status === "owned" ? 0.92 : 0.65,
              wasReady: item.status === "owned",
              estValueMaxCents: item.status === "owned" ? 15000 : null,
            }
          : null,
      photos: [photo(4000 + i, "front")],
    })),
  } as UIFixture & { batchItems: unknown[] };
}

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const ALL_FIXTURES: Array<() => UIFixture> = [
  confidentMatch,
  uncertainParallel,
  notInCatalog,
  notInCatalogPartialExtraction,
  notInCatalogNoExtraction,
  notACard,
  identifyFailed,
  identifyFailedQuota,
  redemption,
  incompleteScanDraft,
  longNameCard,
  itemNoPhoto,
  unpricedItem,
  emptyCollection,
  batchSameSet40,
];
