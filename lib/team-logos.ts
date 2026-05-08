// Local team-logo paths under /public/team-logos.
const TEAM_LOGO: Record<string, string> = {
  "Mumbai Indians": "/team-logos/mumbai-indians.png",
  "Royal Challengers Bengaluru": "/team-logos/royal-challengers-bengaluru.png",
  "Royal Challengers Bangalore": "/team-logos/royal-challengers-bengaluru.png",
  "Chennai Super Kings": "/team-logos/chennai-super-kings.png",
  "Delhi Capitals": "/team-logos/delhi-capitals.png",
  "Punjab Kings": "/team-logos/punjab-kings.png",
  "Kolkata Knight Riders": "/team-logos/kolkata-knight-riders.png",
  "Rajasthan Royals": "/team-logos/rajasthan-royals.png",
  "Sunrisers Hyderabad": "/team-logos/sunrisers-hyderabad.png",
  "Gujarat Titans": "/team-logos/gujarat-titans.png",
  "Lucknow Super Giants": "/team-logos/lucknow-super-giants.png",
};

export function teamLogo(name: string): string | undefined {
  return TEAM_LOGO[name.trim()];
}
