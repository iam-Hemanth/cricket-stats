"use client";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";

export interface FallOfWicket { wicket_num?:number; runs:number; wickets:number; batter_name:string; over:number; over_ball?:number; }

interface InningLine { label: string; color: string; overRuns: number[]; maxOvers: number; fow?: FallOfWicket[]; }

interface Props { innings: InningLine[]; maxRuns: number; }

const W=580, H=280, PL=32, PR=32, PT=16, PB=20;
const cw=W-PL-PR, ch=H-PT-PB;

function getTicks(min: number, max: number, maxTicks = 6) {
  const range = max - min;
  if (range <= 0) return [min];
  const rawStep = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;
  
  step = Math.max(1, step); // no fractional steps for runs/overs
  
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max; v += step) {
    ticks.push(v);
  }
  return ticks;
}

function getInterpolatedRuns(overValue: number, overRuns: number[]) {
  const o = Math.max(0, overValue);
  const lowerIndex = Math.floor(o) - 1;
  const upperIndex = Math.ceil(o) - 1;
  
  const runsLower = lowerIndex < 0 ? 0 : (overRuns[lowerIndex] || 0);
  const runsUpper = upperIndex < 0 ? 0 : (overRuns[upperIndex] || runsLower);

  if (lowerIndex === upperIndex) return runsLower;

  const fraction = o - Math.floor(o);
  return runsLower + fraction * (runsUpper - runsLower);
}

export default function RunChart({ innings, maxRuns: globalMaxRuns }: Props) {
  const [activeTip, setActiveTip] = useState<{x:number, y:number, text:string, color:string}|null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxO = Math.max(...innings.map(i=>i.maxOvers),20);
  const maxR = Math.ceil(globalMaxRuns / 10) * 10 || 10;

  const [domain, setDomain] = useState({ x0: 0, x1: maxO, y0: 0, y1: maxR });

  const resetZoom = useCallback(() => {
    setDomain({ x0: 0, x1: maxO, y0: 0, y1: maxR });
  }, [maxO, maxR]);

  useEffect(() => {
    resetZoom();
  }, [resetZoom]);

  const xRange = domain.x1 - domain.x0;
  const yRange = domain.y1 - domain.y0;

  const toXY = useCallback((over:number, runs:number) => {
    const x = PL + ((over - domain.x0) / xRange) * cw;
    const y = PT + ch - ((runs - domain.y0) / yRange) * ch;
    return [x,y] as const;
  }, [domain.x0, domain.y0, xRange, yRange]);

  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const svgX = (mouseX / rect.width) * W;
      const svgY = (mouseY / rect.height) * H;

      if (svgX < PL || svgX > W - PR || svgY < PT || svgY > PT + ch) return;

      const px = (svgX - PL) / cw;
      const py = 1 - ((svgY - PT) / ch);

      const mouseOver = domain.x0 + px * xRange;
      const mouseRuns = domain.y0 + py * yRange;

      const zoomFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      
      let newXRange = xRange * zoomFactor;
      let newYRange = yRange * zoomFactor;

      if (newXRange > maxO) newXRange = maxO;
      if (newYRange > maxR) newYRange = maxR;

      let newX0 = mouseOver - px * newXRange;
      let newX1 = newX0 + newXRange;
      let newY0 = mouseRuns - py * newYRange;
      let newY1 = newY0 + newYRange;

      if (newX0 < 0) { newX0 = 0; newX1 = newXRange; }
      if (newX1 > maxO) { newX1 = maxO; newX0 = maxO - newXRange; }
      
      if (newY0 < 0) { newY0 = 0; newY1 = newYRange; }
      if (newY1 > maxR) { newY1 = maxR; newY0 = maxR - newYRange; }

      setDomain({ x0: newX0, x1: newX1, y0: newY0, y1: newY1 });
      setActiveTip(null);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (document.activeElement !== el) return;
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      lastYRef.current = e.clientY;
      el.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const dx = e.clientX - lastXRef.current;
      const dy = e.clientY - lastYRef.current;
      lastXRef.current = e.clientX;
      lastYRef.current = e.clientY;

      const rect = el.getBoundingClientRect();
      const svgDx = dx * (W / rect.width);
      const svgDy = dy * (H / rect.height);

      const dOvers = -(svgDx / cw) * xRange;
      const dRuns = (svgDy / ch) * yRange;

      setDomain(prev => {
        let newX0 = prev.x0 + dOvers;
        let newX1 = prev.x1 + dOvers;
        let newY0 = prev.y0 + dRuns;
        let newY1 = prev.y1 + dRuns;

        if (newX0 < 0) { newX1 -= newX0; newX0 = 0; }
        if (newX1 > maxO) { newX0 -= (newX1 - maxO); newX1 = maxO; }
        
        if (newY0 < 0) { newY1 -= newY0; newY0 = 0; }
        if (newY1 > maxR) { newY0 -= (newY1 - maxR); newY1 = maxR; }

        return { x0: newX0, x1: newX1, y0: newY0, y1: newY1 };
      });
      setActiveTip(null);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      el.style.cursor = document.activeElement === el ? 'crosshair' : 'default';
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [domain, xRange, yRange, maxO, maxR]);

  const xLabels = useMemo(() => getTicks(domain.x0, domain.x1, 8), [domain.x0, domain.x1]);
  const yLabels = useMemo(() => getTicks(domain.y0, domain.y1, 6), [domain.y0, domain.y1]);

  return (
    <div 
      className="relative w-full overflow-hidden select-none" 
      style={{ height: "300px" }}
    >
      <div 
        ref={containerRef}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDoubleClick={resetZoom}
        className="w-full h-full outline-none"
        style={{ cursor: isFocused ? "crosshair" : "pointer" }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <svg 
            viewBox={`0 0 ${W} ${H}`} 
            preserveAspectRatio="none" 
            style={{ display: "block", width: "100%", height: "100%" }}
          >
            <defs>
              <clipPath id="chart-area">
                <rect x={PL} y={PT} width={cw} height={ch} />
              </clipPath>
            </defs>

            {/* grid & axes labels */}
            {yLabels.map(v=>{
              const y=PT+ch-((v-domain.y0)/yRange)*ch;
              if (y < PT - 5 || y > PT + ch + 5) return null;
              return <g key={v}>
                <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                <text x={PL-3} y={y+3} fontSize="7" fill="#72808a" textAnchor="end">{v}</text>
              </g>;
            })}
            
            <line x1={PL} y1={PT} x2={PL} y2={PT+ch} stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            <line x1={PL} y1={PT+ch} x2={W-PR} y2={PT+ch} stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
            
            {xLabels.map(o=>{
              const x=PL+((o-domain.x0)/xRange)*cw;
              if (x < PL - 5 || x > W - PR + 5) return null;
              return <text key={o} x={x} y={H-4} fontSize="7" fill="#72808a" textAnchor="middle">{o}</text>;
            })}
            
            {/* Clipped Chart Area */}
            <g clipPath="url(#chart-area)">
              {/* backgrounds & lines */}
              {innings.map((inn,idx)=>{
                const pts=inn.overRuns.map((r,i)=>toXY(i+1,r));
                const origin=toXY(0,0);
                const allPts=[origin,...pts];
                const polyStr=allPts.map(([x,y])=>`${x},${y}`).join(" ");
                const fillPts=[...allPts,toXY(inn.overRuns.length, 0)];
                const fillStr=fillPts.map(([x,y])=>`${x},${y}`).join(" ");
                
                return <g key={`bg-${idx}`}>
                  <polygon points={fillStr} fill={inn.color} fillOpacity="0.07" style={{pointerEvents:"none"}}/>
                  <polyline points={polyStr} fill="none" stroke={inn.color} strokeWidth="1.8"
                    strokeLinejoin="round" strokeLinecap="round" style={{pointerEvents:"none"}}/>
                  
                  {/* Invisible thick line for easy hover detection */}
                  <polyline points={polyStr} fill="none" stroke="transparent" strokeWidth="15"
                    style={{pointerEvents:"stroke", cursor:"crosshair"}}
                    onMouseMove={(e) => {
                      const el = containerRef.current;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      const mouseX = e.clientX - rect.left;
                      const svgX = (mouseX / rect.width) * W;
                      const px = (svgX - PL) / cw;
                      const mouseOver = domain.x0 + px * xRange;
                      
                      if (mouseOver >= 0 && mouseOver <= inn.overRuns.length) {
                        const runs = getInterpolatedRuns(mouseOver, inn.overRuns);
                        const wickets = inn.fow?.filter(w => (w.over ?? w.over_ball ?? 0) <= mouseOver).length || 0;
                        const [wx, wy] = toXY(mouseOver, runs);
                        
                        setActiveTip({
                          x: wx, y: wy, 
                          text: `${Math.round(runs)}-${wickets} (${mouseOver.toFixed(1)})`, 
                          color: inn.color
                        });
                      }
                    }}
                    onMouseLeave={() => setActiveTip(null)}
                  />
                </g>;
              })}

              {/* wickets & endpoints */}
              {innings.map((inn,idx)=>{
                const pts=inn.overRuns.map((r,i)=>toXY(i+1,r));
                const last=pts[pts.length-1];

                return <g key={`fg-${idx}`}>
                  {inn.fow?.map((wicket, i) => {
                    const exactOver = wicket.over ?? wicket.over_ball ?? 0;
                    const visualRuns = getInterpolatedRuns(exactOver, inn.overRuns);
                    const [wx, wy] = toXY(exactOver, visualRuns);
                    
                    if (visualRuns < domain.y0 || visualRuns > domain.y1 || exactOver < domain.x0 || exactOver > domain.x1) return null;
                    const text = `${wicket.runs}-${wicket.wickets ?? wicket.wicket_num ?? i+1} (${exactOver}) - ${wicket.batter_name}`;
                    return (
                      <circle 
                        key={`w-${i}`} 
                        cx={wx} cy={wy} r="3.5" 
                        fill={inn.color} stroke="#10131a" strokeWidth="1.5" 
                        style={{cursor:"crosshair"}}
                        onMouseEnter={() => setActiveTip({x:wx, y:wy, text, color:inn.color})}
                        onMouseLeave={() => setActiveTip(null)}
                      />
                    );
                  })}
                  </g>;
              })}
            </g>
            {/* Endpoints and Final Scores rendered outside clipPath to prevent text truncation */}
            {innings.map((inn,idx)=>{
              const pts=inn.overRuns.map((r,i)=>toXY(i+1,r));
              const last=pts[pts.length-1];

              if (!last) return null;
              
              // Only show the final score if it's currently within the viewable panning area
              if (last[0] < PL - 10 || last[0] > W - PR + 5 || last[1] < PT - 10 || last[1] > PT + ch + 10) {
                return null;
              }

              return <g key={`end-${idx}`} style={{pointerEvents:"none"}}>
                <circle cx={last[0]} cy={last[1]} r="4.5" fill="none" stroke={inn.color} strokeWidth="1.5" opacity="0.6"/>
                <text x={last[0]+5} y={last[1]+3} fontSize="8" fontWeight="bold" fill={inn.color}>{inn.overRuns[inn.overRuns.length-1]}</text>
              </g>;
            })}
          </svg>

          {/* HTML Relative Tooltip Overlay */}
          {activeTip && (
            <div 
              style={{
                position: 'absolute',
                left: `${(activeTip.x / W) * 100}%`,
                top: `${(activeTip.y / H) * 100}%`,
                transform: 'translate(-50%, -100%)',
                marginTop: '-8px',
                backgroundColor: '#1c2026',
                border: `1px solid ${activeTip.color}`,
                color: '#e0e2eb',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '600',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {activeTip.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
