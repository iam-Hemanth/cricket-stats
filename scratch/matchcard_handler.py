
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 11. Match Card
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/v1/match/{match_id}", response_model=MatchCardResponse)
def get_match_card(match_id: str):
    try:
        with db_cursor() as cur:
            # 1. Fetch match info
            cur.execute(Q.GET_MATCH_INFO, (match_id,))
            match_row = cur.fetchone()
            if not match_row:
                raise HTTPException(status_code=404, detail="Match not found")

            # 2. Fetch innings
            cur.execute(Q.GET_MATCH_INNINGS, (match_id,))
            innings_rows = cur.fetchall()

            scorecards = []
            for inn in innings_rows:
                innings_id = inn["innings_id"]
                
                # Fetch deliveries for this innings
                cur.execute(Q.GET_INNINGS_DELIVERIES, (innings_id,))
                deliveries = cur.fetchall()
                
                if not deliveries:
                    continue

                # Process deliveries into scorecard
                batter_stats = {} # batter_id -> dict
                bowler_stats = {} # bowler_id -> dict
                fow = []
                partnerships = []
                
                total_runs = 0
                total_wickets = 0
                total_extras = 0
                extras_breakdown = {"b": 0, "lb": 0, "w": 0, "nb": 0}
                
                # State for partnerships
                current_batter1 = None
                current_batter2 = None
                curr_p_runs = 0
                curr_p_balls = 0
                
                def init_batter(bid, bname):
                    if bid not in batter_stats:
                        batter_stats[bid] = {
                            "batter_id": bid, "batter_name": bname,
                            "runs": 0, "balls": 0, "fours": 0, "sixes": 0,
                            "dismissal_text": "not out"
                        }
                
                def init_bowler(bid, bname):
                    if bid not in bowler_stats:
                        bowler_stats[bid] = {
                            "bowler_id": bid, "bowler_name": bname,
                            "legal_balls": 0, "runs": 0, "wickets": 0,
                            "wides": 0, "no_balls": 0
                        }

                last_ball = None
                
                for d in deliveries:
                    init_batter(d["batter_id"], d["batter_name"])
                    init_batter(d["non_striker_id"], d["non_striker_name"])
                    init_bowler(d["bowler_id"], d["bowler_name"])
                    
                    b = batter_stats[d["batter_id"]]
                    bo = bowler_stats[d["bowler_id"]]
                    
                    # Batter stats
                    if not d["is_wide"]:
                        b["balls"] += 1
                    b["runs"] += d["runs_batter"]
                    if d["runs_batter"] == 4 and not d["is_wide"]: # sometimes boundaries are byes, but runs_batter is 0 then
                        b["fours"] += 1
                    elif d["runs_batter"] == 6 and not d["is_wide"]:
                        b["sixes"] += 1
                        
                    # Bowler stats
                    if not d["is_wide"] and not d["is_noball"]:
                        bo["legal_balls"] += 1
                    
                    bo["runs"] += d["runs_batter"] + (d["runs_extras"] if (d["is_wide"] or d["is_noball"]) else 0)
                    if d["is_wide"]: bo["wides"] += 1
                    if d["is_noball"]: bo["no_balls"] += 1
                    
                    # Totals
                    total_runs += d["runs_total"]
                    total_extras += d["runs_extras"]
                    if d["is_wide"]: extras_breakdown["w"] += d["runs_extras"]
                    if d["is_noball"]: extras_breakdown["nb"] += d["runs_extras"]
                    if d["is_bye"]: extras_breakdown["b"] += d["runs_extras"]
                    if d["is_legbye"]: extras_breakdown["lb"] += d["runs_extras"]
                    
                    # Partnership tracking
                    # Simple heuristic: we know who is on strike and non-strike
                    b1, b2 = sorted([d["batter_id"], d["non_striker_id"]])
                    if current_batter1 != b1 or current_batter2 != b2:
                        # Save old partnership if exists and has balls/runs
                        if current_batter1 is not None and (curr_p_balls > 0 or curr_p_runs > 0):
                            partnerships.append({
                                "batter1_id": current_batter1, "batter1_name": batter_stats[current_batter1]["batter_name"],
                                "batter2_id": current_batter2, "batter2_name": batter_stats[current_batter2]["batter_name"],
                                "total_runs": curr_p_runs, "total_balls": curr_p_balls,
                                # We aren't tracking individual contribution in partnership for now to keep it simple, 
                                # but API requires it. Let's set to 0.
                                "batter1_runs": 0, "batter1_balls": 0, "batter2_runs": 0, "batter2_balls": 0
                            })
                        current_batter1 = b1
                        current_batter2 = b2
                        curr_p_runs = 0
                        curr_p_balls = 0
                        
                    curr_p_runs += d["runs_total"]
                    if not d["is_wide"]: curr_p_balls += 1
                    
                    # Wicket
                    if d["wicket_id"] is not None:
                        out_id = d["player_out_id"]
                        kind = d["dismissal_kind"]
                        
                        # FOW
                        total_wickets += 1
                        over_ball = float(f"{d['over_number']}.{d['ball_number']}")
                        out_name = d["batter_name"] if out_id == d["batter_id"] else d["non_striker_name"]
                        fow.append(FallOfWicket(
                            runs=total_runs, wickets=total_wickets, 
                            batter_id=out_id, batter_name=out_name, over=over_ball
                        ))
                        
                        # Dismissal text
                        out_b = batter_stats.get(out_id)
                        if out_b:
                            if kind in ('bowled', 'lbw'):
                                out_b["dismissal_text"] = f"{kind} b {d['bowler_name']}"
                            elif kind == 'caught':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"c {f1} b {d['bowler_name']}"
                            elif kind == 'run out':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"run out ({f1})"
                            elif kind == 'stumped':
                                f1 = d['fielder1_name'] or "sub"
                                out_b["dismissal_text"] = f"st {f1} b {d['bowler_name']}"
                            elif kind == 'caught and bowled':
                                out_b["dismissal_text"] = f"c & b {d['bowler_name']}"
                            else:
                                out_b["dismissal_text"] = kind
                                
                        if kind not in ('run out', 'retired hurt', 'obstructing the field', 'retired not out'):
                            bo["wickets"] += 1
                            
                    last_ball = d

                # Append last partnership
                if current_batter1 is not None and (curr_p_balls > 0 or curr_p_runs > 0):
                    partnerships.append({
                        "batter1_id": current_batter1, "batter1_name": batter_stats[current_batter1]["batter_name"],
                        "batter2_id": current_batter2, "batter2_name": batter_stats[current_batter2]["batter_name"],
                        "total_runs": curr_p_runs, "total_balls": curr_p_balls,
                        "batter1_runs": 0, "batter1_balls": 0, "batter2_runs": 0, "batter2_balls": 0
                    })

                # Calculate final over count for team
                total_overs = 0.0
                if last_ball:
                    total_overs = float(f"{last_ball['over_number']}.{last_ball['ball_number']}")
                
                # Format batters
                final_batters = []
                for b in batter_stats.values():
                    sr = (b["runs"] / b["balls"] * 100) if b["balls"] > 0 else None
                    if sr is not None: sr = round(sr, 2)
                    final_batters.append(BatterScorecard(
                        batter_id=b["batter_id"], batter_name=b["batter_name"],
                        runs=b["runs"], balls=b["balls"], fours=b["fours"], sixes=b["sixes"],
                        strike_rate=sr, dismissal_text=b["dismissal_text"]
                    ))
                    
                # Format bowlers
                final_bowlers = []
                for bo in bowler_stats.values():
                    legal = bo["legal_balls"]
                    overs_str = f"{legal // 6}.{legal % 6}"
                    overs_float = float(overs_str)
                    econ = (bo["runs"] / (legal / 6.0)) if legal > 0 else None
                    if econ is not None: econ = round(econ, 2)
                    final_bowlers.append(BowlerScorecard(
                        bowler_id=bo["bowler_id"], bowler_name=bo["bowler_name"],
                        overs=overs_float, maidens=0, runs=bo["runs"], wickets=bo["wickets"],
                        economy=econ, wides=bo["wides"], no_balls=bo["no_balls"]
                    ))

                extras_str = f"(b {extras_breakdown['b']}, lb {extras_breakdown['lb']}, w {extras_breakdown['w']}, nb {extras_breakdown['nb']})"

                scorecards.append(InningScorecard(
                    inning_number=inn["innings_number"],
                    batting_team=inn["batting_team"],
                    bowling_team=inn["bowling_team"],
                    total_runs=total_runs,
                    total_wickets=total_wickets,
                    overs=total_overs,
                    extras=total_extras,
                    extras_detail=extras_str,
                    batters=final_batters,
                    bowlers=final_bowlers,
                    fow=fow,
                    partnerships=[PartnershipScorecard(**p) for p in partnerships]
                ))
            
            # Construct final response
            win_margin = None
            if match_row["win_by_runs"]:
                win_margin = f"{match_row['win_by_runs']} runs"
            elif match_row["win_by_wickets"]:
                win_margin = f"{match_row['win_by_wickets']} wickets"
                
            return MatchCardResponse(
                match_id=match_row["match_id"],
                date=match_row["date"],
                venue=match_row["venue"],
                city=match_row["city"],
                format=match_row["format"],
                competition=match_row["competition"],
                team1=match_row["team1"],
                team2=match_row["team2"],
                winner=match_row["winner"],
                win_margin=win_margin,
                toss_winner=match_row["toss_winner"],
                toss_decision=match_row["toss_decision"],
                player_of_match=match_row["player_of_match"],
                day_night=match_row["day_night"],
                playing_xi=match_row["playing_xi"],
                scorecard=scorecards
            )

    except HTTPException:
        raise
    except Exception as e:
        raise _server_error(e, "get_match_card")

