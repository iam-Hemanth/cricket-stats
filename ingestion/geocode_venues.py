#!/usr/bin/env python3
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = Path(__file__).parent / "venue_to_country.json"
UNRESOLVED_FILE = Path(__file__).parent / "unresolved_venues.txt"

CITY_TO_COUNTRY: dict[str, str] = {
    # India
    "Mumbai": "India", "Chennai": "India", "Kolkata": "India", "Delhi": "India", "Bengaluru": "India", 
    "Bangalore": "India", "Hyderabad": "India", "Pune": "India", "Ahmedabad": "India", "Rajkot": "India", 
    "Nagpur": "India", "Cuttack": "India", "Visakhapatnam": "India", "Ranchi": "India", "Indore": "India", 
    "Mohali": "India", "Chandigarh": "India", "Dharamsala": "India", "Jaipur": "India", "Lucknow": "India", 
    "Guwahati": "India", "Thiruvananthapuram": "India", "Raipur": "India", "Kanpur": "India", "Vadodara": "India", 
    "Surat": "India", "Kochi": "India", "Jammu": "India", "Gwalior": "India", "Dehra Dun": "India", 
    "Dehradun": "India", "Barsapara": "India", "Mangalagiri": "India", "Palam": "India", "Alur": "India", 
    "Jamshedpur": "India", "Faridabad": "India", "Margao": "India", "Bogra": "India", "Khulna": "India",
    # Australia
    "Melbourne": "Australia", "Sydney": "Australia", "Brisbane": "Australia", "Perth": "Australia", 
    "Adelaide": "Australia", "Hobart": "Australia", "Canberra": "Australia", "Darwin": "Australia", 
    "Cairns": "Australia", "Townsville": "Australia", "Geelong": "Australia", "Launceston": "Australia", 
    "Bendigo": "Australia", "Carrara": "Australia", "Mackay": "Australia", "Coffs Harbour": "Australia", 
    "Albury": "Australia", "Wollongong": "Australia", "Victoria": "Australia", "Alice Springs": "Australia", "Moe": "Australia",
    # England & Wales
    "London": "England", "Manchester": "England", "Birmingham": "England", "Leeds": "England", 
    "Nottingham": "England", "Southampton": "England", "Bristol": "England", "Chester-le-Street": "England", 
    "Durham": "England", "Taunton": "England", "Canterbury": "England", "Worcester": "England", 
    "Chelmsford": "England", "Derby": "England", "Leicester": "England", "Cardiff": "Wales", "Swansea": "Wales",
    "Liverpool": "England", "Arundel": "England", "Frinton-on-Sea": "England", "Radlett": "England", 
    "Milton Keynes": "England", "Colchester": "England", "Kidderminster": "England", "York": "England", 
    "Cheltenham": "England", "Brighton": "England", "Northampton": "England", "Bishop's Stortford": "England", 
    "Horsham": "England", "Grantham": "England", "Beckenham": "England", "Kibworth": "England", 
    "Northwood": "England", "Tunbridge Wells": "England", "Newport": "England", "Isle-of-Wight": "England", 
    "Scarborough": "England", "Oakham": "England", "Richmond": "England", "Chesterfield": "England", 
    "Rugby": "England", "Sedbergh": "England", "Blackpool": "England", "Halstead": "England", 
    "Nettleworth": "England", "Sookholme": "England", "Market Warsop": "England", "Welbeck": "England", 
    "Eastbourne": "England", "Southport": "England", "Uxbridge": "England", "Guildford": "England",
    # New Zealand
    "Auckland": "New Zealand", "Wellington": "New Zealand", "Christchurch": "New Zealand", 
    "Hamilton": "New Zealand", "Napier": "New Zealand", "Dunedin": "New Zealand", 
    "Mount Maunganui": "New Zealand", "Nelson": "New Zealand", "Lincoln": "New Zealand", 
    "Whangarei": "New Zealand", "Queenstown": "New Zealand", "Palmerston North": "New Zealand", 
    "Gisborne": "New Zealand", "Rangiora": "New Zealand", "Alexandra": "New Zealand", 
    "New Plymouth": "New Zealand", "Invercargill": "New Zealand",
    # Pakistan
    "Karachi": "Pakistan", "Lahore": "Pakistan", "Rawalpindi": "Pakistan", "Faisalabad": "Pakistan", 
    "Multan": "Pakistan", "Peshawar": "Pakistan", "Gaddafi Stadium": "Pakistan", "Sind": "Pakistan",
    # Sri Lanka
    "Colombo": "Sri Lanka", "Galle": "Sri Lanka", "Kandy": "Sri Lanka", "Dambulla": "Sri Lanka", 
    "Pallekele": "Sri Lanka", "Hambantota": "Sri Lanka", "Moratuwa": "Sri Lanka", "Katunayake": "Sri Lanka", 
    "Welisara": "Sri Lanka", "Maggona": "Sri Lanka", "Panadura": "Sri Lanka", "Kaluthara": "Sri Lanka", "Kurunegala": "Sri Lanka",
    # South Africa
    "Cape Town": "South Africa", "Johannesburg": "South Africa", "Durban": "South Africa", 
    "Port Elizabeth": "South Africa", "Pretoria": "South Africa", "Centurion": "South Africa", 
    "Bloemfontein": "South Africa", "Paarl": "South Africa", "Potchefstroom": "South Africa", 
    "Benoni": "South Africa", "East London": "South Africa", "Pietermaritzburg": "South Africa", 
    "Kimberley": "South Africa", "Gqeberha": "South Africa",
    # Bangladesh
    "Dhaka": "Bangladesh", "Chittagong": "Bangladesh", "Mirpur": "Bangladesh", "Fatullah": "Bangladesh", 
    "Sylhet": "Bangladesh", "Chattogram": "Bangladesh",
    # Zimbabwe
    "Harare": "Zimbabwe", "Bulawayo": "Zimbabwe", "Mutare": "Zimbabwe", "Kwekwe": "Zimbabwe",
    # West Indies
    "Bridgetown": "West Indies", "Kingston": "West Indies", "Port of Spain": "West Indies", 
    "Georgetown": "West Indies", "St John's": "West Indies", "Basseterre": "West Indies", 
    "Providence": "West Indies", "St George's": "West Indies", "St Lucia": "West Indies", 
    "Gros Islet": "West Indies", "St Vincent": "West Indies", "Antigua": "West Indies", 
    "Coolidge": "West Indies", "Grenada": "West Indies", "Trinidad": "West Indies", 
    "Dominica": "West Indies", "St Kitts": "West Indies",
    # UAE
    "Dubai": "United Arab Emirates", "Abu Dhabi": "United Arab Emirates", "Sharjah": "United Arab Emirates",
    # Ireland & Scotland
    "Dublin": "Ireland", "Belfast": "Ireland", "Malahide": "Ireland", "Clontarf": "Ireland", 
    "Bready": "Ireland", "Londonderry": "Ireland", "Derry": "Ireland", "Strabane": "Ireland", 
    "Cork": "Ireland", "Wicklow": "Ireland", "Comber": "Ireland", "Milverton": "Ireland", 
    "Waringstown": "Ireland", "Eglinton": "Ireland", "Stormont": "Ireland",
    "Edinburgh": "Scotland", "Glasgow": "Scotland", "Ayr": "Scotland", "Dundee": "Scotland", 
    "Stirling": "Scotland", "Aberdeen": "Scotland",
    # Netherlands
    "Rotterdam": "Netherlands", "Amstelveen": "Netherlands", "Amsterdam": "Netherlands", 
    "The Hague": "Netherlands", "Voorburg": "Netherlands", "Deventer": "Netherlands", "Utrecht": "Netherlands", "Schiedam": "Netherlands",
    # USA & Canada
    "Toronto": "Canada", "King City": "Canada", "Dallas": "United States", "New York": "United States", 
    "Houston": "United States", "Lauderhill": "United States", "Pearland": "United States", 
    "Oakland": "United States", "Morrisville": "United States", "Grand Prairie": "United States", "Los Angeles": "United States",
    # Others
    "Nairobi": "Kenya", "Mombasa": "Kenya", "Singapore": "Singapore", "Padang": "Singapore", 
    "Kathmandu": "Nepal", "Kirtipur": "Nepal", "Port Moresby": "Papua New Guinea", "Windhoek": "Namibia", 
    "Dar-es-Salaam": "Tanzania", "Chiang Mai": "Thailand", "Bangkok": "Thailand", "Kuala Lumpur": "Malaysia", 
    "Bandar Kinrara": "Malaysia", "Bangi": "Malaysia", "Vantaa": "Finland", "Kerava": "Finland", 
    "Albergaria": "Portugal", "Port Soif": "Guernsey", "St Peter Port": "Guernsey", "St Saviour": "Guernsey", 
    "Castel": "Guernsey", "St Clement": "Jersey", "St Martin": "Jersey", "St Helier": "Jersey", 
    "Episkopi": "Cyprus", "Walferdange": "Luxembourg", "Prague": "Czech Republic", "Oslo": "Norway", 
    "Sofia": "Bulgaria", "Zagreb": "Croatia", "Belgrade": "Serbia", "Ilfov County": "Romania", 
    "Tallinn": "Estonia", "Gibraltar": "Gibraltar", "Ishoj": "Denmark", "Koge": "Denmark", 
    "Copenhagen": "Denmark", "Brondby": "Denmark", "Glostrup": "Denmark", "Marsa": "Malta", 
    "Ghent": "Belgium", "Waterloo": "Belgium", "Zemst": "Belgium", "Graz": "Austria", 
    "Latschach": "Austria", "Krefeld": "Germany", "Stockholm": "Sweden", "Medicina": "Italy", 
    "Navile": "Italy", "Pianoro": "Italy", "Spinaceto": "Italy", "Rome": "Italy", "Almeria": "Spain", 
    "Murcia": "Spain", "Dreux": "France", "Panama City": "Panama", "George Town": "Cayman Islands", 
    "Port Vila": "Vanuatu", "Kigali City": "Rwanda", "Accra": "Ghana", "Suva": "Fiji", 
    "Gaborone": "Botswana", "Lagos": "Nigeria", "Abuja": "Nigeria", "Kuwait City": "Kuwait", 
    "Bali": "Indonesia", "Doha": "Qatar", "Incheon": "South Korea", "Hangzhou": "China", 
    "Apia": "Samoa", "Dasmarinas": "Philippines", "Szodliget": "Hungary", "Gelephu": "Bhutan", 
    "Guacima": "Costa Rica", "Seropedica": "Brazil", "Bermuda": "Bermuda",
    "Panagoda": "Sri Lanka", "Colwyn Bay": "Wales", "Entebbe": "Uganda", "Port Soif": "Guernsey", 
    "Port  Soif": "Guernsey", "Coggeshall": "England", "Jinja": "Uganda", "Kampala": "Uganda", "Malkerns": "Swaziland", 
    "Gosforth": "England", "Blantyre": "Malawi", "Neath": "Wales", "Sano": "Japan", 
    "Kalamassery": "India", "Rhun": "India", "Surat": "India", "Cuttack": "India", 
    "Vijayawada": "India", "Chandigarh": "India", "Thiruvananthapuram": "India", 
    "Vadodara": "India", "Chennai": "India", "Whangarei": "New Zealand", "Napier": "New Zealand",
    "Argentina": "Argentina", "Buenos Aires": "Argentina", "Mong Kok": "Hong Kong",
}

VENUE_TO_COUNTRY: dict[str, str] = {
    "Lord's": "England", "The Oval": "England", "Edgbaston": "England", "Headingley": "England", 
    "Old Trafford": "England", "Trent Bridge": "England", "Rose Bowl": "England", "The Rose Bowl": "England", 
    "ICC Academy": "United Arab Emirates", "ICC Cricket Academy": "United Arab Emirates", 
    "Dubai International Cricket Stadium": "United Arab Emirates", "Sharjah Cricket Stadium": "United Arab Emirates", 
    "Sheikh Zayed Stadium": "United Arab Emirates", "Adelaide Oval": "Australia", "Melbourne Cricket Ground": "Australia", 
    "Sydney Cricket Ground": "Australia", "Perth Stadium": "Australia", "The Gabba": "Australia", 
    "W.A.C.A. Ground": "Australia", "Bellerive Oval": "Australia", "Manuka Oval": "Australia", 
    "Galle International Stadium": "Sri Lanka", "Pallekele International Cricket Stadium": "Sri Lanka", 
    "Rangiri Dambulla International Stadium": "Sri Lanka", "Mahinda Rajapaksa International Cricket Stadium": "Sri Lanka", 
    "R.Premadasa Stadium": "Sri Lanka", "Zahur Ahmed Chowdhury Stadium": "Bangladesh", 
    "Sher-e-Bangla National Cricket Stadium": "Bangladesh", "Sylhet International Cricket Stadium": "Bangladesh", 
    "Harare Sports Club": "Zimbabwe", "Queens Sports Club": "Zimbabwe", "Kensington Oval": "West Indies", 
    "Sabina Park": "West Indies", "Sir Vivian Richards Stadium": "West Indies", "Brian Lara Stadium": "West Indies", 
    "Warner Park": "West Indies", "National Cricket Stadium": "West Indies", "Arnos Vale Ground": "West Indies", 
    "Providence Stadium": "West Indies", "Daren Sammy National Cricket Stadium": "West Indies", 
    "Darren Sammy National Cricket Stadium": "West Indies", "Himachal Pradesh Cricket Association Stadium": "India", 
    "Narendra Modi Stadium": "India", "Holkar Stadium": "India", "Eden Gardens": "India", "Wankhede Stadium": "India", 
    "M.Chinnaswamy Stadium": "India", "Arun Jaitley Stadium": "India", "MA Chidambaram Stadium": "India", 
    "Rajiv Gandhi International Stadium": "India", "Punjab Cricket Association": "India", 
    "Saurashtra Cricket Association": "India", "Maharashtra Cricket Association": "India", 
    "JSCA International Stadium": "India", "Vidarbha Cricket Association": "India", 
    "Sawai Mansingh Stadium": "India", "Al Dhaid Cricket Village": "United Arab Emirates", "Alembic": "India", "Arundel Castle": "England", 
    "Bulawayo Athletic Club": "Zimbabwe", "C B Patel Ground": "India", "Carrara Oval": "Australia", 
    "Chittagong Divisional Stadium": "Bangladesh", "Cobham Oval": "New Zealand", "Colin Maiden Park": "New Zealand", 
    "Cricket Stadium, Sector-16": "India", "DRIEMS Ground": "India", "Gokaraju Laila": "India", 
    "Dr. Y.S. Rajasekhara Reddy ACA VDCA Cricket Stadium": "India", 
    "Mission Road Ground": "Hong Kong", 
    "St  Pauls college ground  Kalamassery": "India",
    "F B Colony Ground": "Pakistan", "Fitzherbert Park": "New Zealand", "GSSS, Sector 26": "India", 
    "Greenfield Stadium": "India", "Hong Kong Cricket Club": "Hong Kong", "Jawaharlal Nehru Stadium": "India", 
    "Kennards Hire Community Oval": "Australia", "Kowloon Cricket Club": "Hong Kong", "Mainpower Oval": "New Zealand", 
    "Moara Vlasiei Cricket Ground": "Romania", "Mombasa Sports Club Ground": "Kenya", "Motibaug Cricket Ground": "India", 
    "Nehru Stadium": "India", "Nelson Park": "New Zealand", "Queenstown Events Centre": "New Zealand", 
    "Sano International Cricket Ground": "Japan", "Sheikhupura Stadium": "Pakistan", "St Pauls college ground": "India", 
    "St Georges Quilmes": "Argentina", "St'Xavier's KCA": "India", "Sydney Showground Stadium": "Australia", 
    "Sylhet Stadium": "Bangladesh", "T I Murugappa Ground": "India", "University of Otago Oval": "New Zealand", 
    "Uxbridge Cricket Club Ground": "England", "West Mersea Cricket Club": "England", 
    "Green Park": "India", "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium": "India", 
    "Ekana Cricket Stadium": "India", "Grand Prairie Stadium": "United States", "Church Street Park": "United States", 
    "Moosa Cricket Stadium": "United States", "Central Broward Regional Park": "United States", 
    "Eden Park": "New Zealand", "Bay Oval": "New Zealand", "Seddon Park": "New Zealand", 
    "Hagley Oval": "New Zealand", "Basin Reserve": "New Zealand", "McLean Park": "New Zealand", 
    "Saxton Oval": "New Zealand", "University Oval": "New Zealand", "Gahanga International Cricket Stadium": "Rwanda", 
    "Tribhuvan University International Cricket Ground": "Nepal", "Al Amerat Cricket Ground": "Oman", "Windsor Park": "West Indies",
    "Barsapara": "India", "Mangalagiri": "India", "Palam": "India", "Alur": "India", "BKC Ground": "India", 
    "Chaudhry Bansi Lal": "India", "Dr P.V.G. Raju": "India", "Gokaraju Liala Gangaaraju": "India", 
    "JU Second Campus": "India", "Jadavpur University": "India", "Lalbhai Contractor": "India", 
    "Reliance Cricket Stadium": "India", "SSN College": "India", "Shaheed Veer Narayan Singh": "India", 
    "Sharad Pawar Cricket Academy": "India", "Sri Ramachandra Medical College": "India", 
    "VCA Ground": "India", "ACA Stadium": "India", "Abhimanyu Cricket Academy": "India", 
    "Emerald Heights": "India", "Gurugram Cricket Ground": "India", "IC-Gurunanak": "India",
    "Dubai Sports City Cricket Stadium": "United Arab Emirates",
    "Entebbe Cricket Oval": "Uganda",
}

def resolve_country(venue: str, city: str | None) -> str | None:
    v_clean = venue.strip()
    c_clean = city.strip() if city else None
    if v_clean in VENUE_TO_COUNTRY: return VENUE_TO_COUNTRY[v_clean]
    v_lower = v_clean.lower()
    for key, country in VENUE_TO_COUNTRY.items():
        if key.lower() in v_lower: return country
    if c_clean:
        if c_clean in CITY_TO_COUNTRY: return CITY_TO_COUNTRY[c_clean]
        c_lower = c_clean.lower()
        for k, country in CITY_TO_COUNTRY.items():
            if k.lower() == c_lower: return country
    return None

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args: sys.exit(1)
    folder = Path(args[0])
    venue_map, unresolved = {}, set()
    files = sorted(folder.glob("*.json"))
    for filepath in files:
        with open(filepath) as f: data = json.load(f)
        info = data.get("info", {})
        venue, city = info.get("venue", "").strip(), info.get("city")
        if not venue or venue in venue_map: continue
        country = resolve_country(venue, city)
        if country: venue_map[venue] = country
        else: unresolved.add((venue, city))
    OUTPUT_FILE.write_text(json.dumps(venue_map, indent=2, sort_keys=True))
    if unresolved:
        lines = sorted(f"{v} | city={c}" for v, c in unresolved)
        UNRESOLVED_FILE.write_text("\n".join(lines))
    else: UNRESOLVED_FILE.unlink(missing_ok=True)
    print(f"✓ {len(venue_map)} venues mapped, {len(unresolved)} unresolved.")

if __name__ == "__main__": main()
