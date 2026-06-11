export interface TeamIdentity {
  abbr: string;
  flag: string;
  primary: string;
  secondary: string;
  homeCities?: string[];
  homeCountry?: string;
  colorFamily?: string;
  logoUrl?: string;
}

const TEAM_META: Record<string, TeamIdentity> = {
  // International Teams
  "India": { abbr: "IND", flag: "🇮🇳", primary: "var(--accent-blue)", secondary: "#ff8a00", homeCountry: "India", colorFamily: "blue", logoUrl: "/logos/countries/IND.svg" },
  "Australia": { abbr: "AUS", flag: "🇦🇺", primary: "var(--accent-gold)", secondary: "var(--accent-green)", homeCountry: "Australia", colorFamily: "gold", logoUrl: "/logos/countries/AUS.svg" },
  "England": { abbr: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", primary: "var(--text-primary)", secondary: "var(--accent-red)", homeCountry: "England", colorFamily: "white", logoUrl: "/logos/countries/ENG.svg" },
  "New Zealand": { abbr: "NZ", flag: "🇳🇿", primary: "var(--text-primary)", secondary: "var(--text-muted)", homeCountry: "New Zealand", colorFamily: "white", logoUrl: "/logos/countries/NZ.svg" },
  "South Africa": { abbr: "SA", flag: "🇿🇦", primary: "var(--accent-green)", secondary: "var(--accent-gold)", homeCountry: "South Africa", colorFamily: "green", logoUrl: "/logos/countries/SA.svg" },
  "Pakistan": { abbr: "PAK", flag: "🇵🇰", primary: "var(--accent-green)", secondary: "var(--accent-gold)", homeCountry: "Pakistan", colorFamily: "green", logoUrl: "/logos/countries/PAK.svg" },
  "Sri Lanka": { abbr: "SL", flag: "🇱🇰", primary: "var(--accent-blue)", secondary: "var(--accent-gold)", homeCountry: "Sri Lanka", colorFamily: "blue", logoUrl: "/logos/countries/SL.svg" },
  "West Indies": { abbr: "WI", flag: "🌴", primary: "var(--accent-purple)", secondary: "var(--accent-red)", homeCountry: "West Indies", colorFamily: "purple", logoUrl: "/logos/countries/WI.svg" },
  "Bangladesh": { abbr: "BAN", flag: "🇧🇩", primary: "var(--accent-green)", secondary: "var(--accent-red)", homeCountry: "Bangladesh", colorFamily: "green" },
  "Afghanistan": { abbr: "AFG", flag: "🇦🇫", primary: "var(--accent-blue)", secondary: "var(--accent-red)", homeCountry: "Afghanistan", colorFamily: "blue" },
  "Ireland": { abbr: "IRE", flag: "🇮🇪", primary: "var(--accent-green)", secondary: "var(--text-primary)", homeCountry: "Ireland", colorFamily: "green" },
  "Scotland": { abbr: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", primary: "var(--accent-blue)", secondary: "var(--text-primary)", homeCountry: "Scotland", colorFamily: "blue" },
  "Netherlands": { abbr: "NED", flag: "🇳🇱", primary: "#ff822e", secondary: "var(--accent-blue)", homeCountry: "Netherlands", colorFamily: "orange" },
  "Zimbabwe": { abbr: "ZIM", flag: "🇿🇼", primary: "var(--accent-red)", secondary: "var(--accent-gold)", homeCountry: "Zimbabwe", colorFamily: "red" },
  "Nepal": { abbr: "NEP", flag: "🇳🇵", primary: "var(--accent-blue)", secondary: "var(--accent-red)", homeCountry: "Nepal", colorFamily: "blue" },
  "Namibia": { abbr: "NAM", flag: "🇳🇦", primary: "var(--accent-blue)", secondary: "var(--accent-red)", homeCountry: "Namibia", colorFamily: "blue" },
  "United States of America": { abbr: "USA", flag: "🇺🇸", primary: "var(--accent-blue)", secondary: "var(--accent-red)", homeCountry: "USA", colorFamily: "blue" },
  "Canada": { abbr: "CAN", flag: "🇨🇦", primary: "var(--accent-red)", secondary: "var(--text-primary)", homeCountry: "Canada", colorFamily: "red" },
  "Oman": { abbr: "OMA", flag: "🇴🇲", primary: "var(--accent-red)", secondary: "var(--text-primary)", homeCountry: "Oman", colorFamily: "red" },
  "Papua New Guinea": { abbr: "PNG", flag: "🇵🇬", primary: "#000000", secondary: "var(--accent-red)", homeCountry: "Papua New Guinea", colorFamily: "white" },
  "United Arab Emirates": { abbr: "UAE", flag: "🇦🇪", primary: "#00732f", secondary: "var(--accent-red)", homeCountry: "UAE", colorFamily: "green" },
  "Hong Kong": { abbr: "HK", flag: "🇭🇰", primary: "var(--accent-red)", secondary: "var(--text-primary)", homeCountry: "Hong Kong", colorFamily: "red" },
  "Uganda": { abbr: "UGA", flag: "🇺🇬", primary: "#fcd116", secondary: "#ce1126", homeCities: ["Uganda"], colorFamily: "gold" },
  "Kenya": { abbr: "KEN", flag: "🇰🇪", primary: "#ce1126", secondary: "#000000", homeCities: ["Kenya"], colorFamily: "red" },
  "Bermuda": { abbr: "BER", flag: "🇧🇲", primary: "#ce1126", secondary: "#000000", homeCities: ["Bermuda"], colorFamily: "red" },
  "Jersey": { abbr: "JER", flag: "🇯🇪", primary: "#ce1126", secondary: "#ffffff", homeCities: ["Jersey"], colorFamily: "red" },
  
  // IPL Teams
  "Royal Challengers Bengaluru": { abbr: "RCB", flag: "RCB", primary: "#E8342A", secondary: "#D4950A", homeCities: ["Bengaluru", "Bangalore"], colorFamily: "red", logoUrl: "/logos/ipl/RCB.svg" },
  "Mumbai Indians": { abbr: "MI", flag: "MI", primary: "#004BA0", secondary: "#D4950A", homeCities: ["Mumbai"], colorFamily: "blue", logoUrl: "/logos/ipl/MI.svg" },
  "Chennai Super Kings": { abbr: "CSK", flag: "CSK", primary: "#FFFF00", secondary: "#0081E9", homeCities: ["Chennai"], colorFamily: "gold", logoUrl: "/logos/ipl/CSK.svg" },
  "Kolkata Knight Riders": { abbr: "KKR", flag: "KKR", primary: "#3A225D", secondary: "#B3A123", homeCities: ["Kolkata"], colorFamily: "purple", logoUrl: "/logos/ipl/KKR.svg" },
  "Sunrisers Hyderabad": { abbr: "SRH", flag: "SRH", primary: "#FF822E", secondary: "#000000", homeCities: ["Hyderabad"], colorFamily: "orange", logoUrl: "/logos/ipl/SRH.svg" },
  "Punjab Kings": { abbr: "PBKS", flag: "PBKS", primary: "#DD1F2D", secondary: "#FFFFFF", homeCities: ["Mohali", "Dharamsala", "Indore", "Chandigarh"], colorFamily: "red", logoUrl: "/logos/ipl/PBKS.svg" },
  "Delhi Capitals": { abbr: "DC", flag: "DC", primary: "#005DA0", secondary: "#EF3B24", homeCities: ["Delhi"], colorFamily: "blue", logoUrl: "/logos/ipl/DC.svg" },
  "Rajasthan Royals": { abbr: "RR", flag: "RR", primary: "#EA1A85", secondary: "#004BA0", homeCities: ["Jaipur", "Guwahati"], colorFamily: "purple", logoUrl: "/logos/ipl/RR.svg" },
  "Gujarat Titans": { abbr: "GT", flag: "GT", primary: "#1d315f", secondary: "#BC9412", homeCities: ["Ahmedabad"], colorFamily: "blue", logoUrl: "/logos/ipl/GT.svg" },
  "Lucknow Super Giants": { abbr: "LSG", flag: "LSG", primary: "#0057E2", secondary: "#D4950A", homeCities: ["Lucknow"], colorFamily: "blue", logoUrl: "/logos/ipl/LSG.svg" },
  
  // Legacy IPL Teams
  "Deccan Chargers": { abbr: "DEC", flag: "DEC", primary: "#004B8D", secondary: "#FFFFFF", homeCities: ["Hyderabad"], colorFamily: "blue" },
  "Gujarat Lions": { abbr: "GL", flag: "GL", primary: "#E66A05", secondary: "#FFD700", homeCities: ["Rajkot"], colorFamily: "orange" },
  "Rising Pune Supergiant": { abbr: "RPS", flag: "RPS", primary: "#D11D55", secondary: "#FFD700", homeCities: ["Pune"], colorFamily: "purple" },
  "Pune Warriors India": { abbr: "PWI", flag: "PWI", primary: "#2F358F", secondary: "#D3D3D3", homeCities: ["Pune"], colorFamily: "blue" },
  "Kochi Tuskers Kerala": { abbr: "KTK", flag: "KTK", primary: "#6F2B91", secondary: "#FF822E", homeCities: ["Kochi"], colorFamily: "purple" },
};

export function getTeamIdentity(teamName: string): TeamIdentity {
  if (TEAM_META[teamName]) return TEAM_META[teamName];

  let normalized = teamName;
  if (teamName === "Royal Challengers Bangalore") normalized = "Royal Challengers Bengaluru";
  if (teamName === "Kings XI Punjab") normalized = "Punjab Kings";
  if (teamName === "Delhi Daredevils") normalized = "Delhi Capitals";

  if (TEAM_META[normalized]) return TEAM_META[normalized];

  // Fallback
  const abbr = teamName.split(" ").map(w => w[0]).join("").substring(0, 4).toUpperCase();
  return {
    abbr,
    flag: abbr,
    primary: "var(--text-muted)",
    secondary: "var(--glass-border)",
  };
}
