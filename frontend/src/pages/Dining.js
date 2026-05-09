import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Utensils, AlertCircle, RefreshCw, Info } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

// FRONTEND EMERGENCY COORDS
const EMERGENCY_COORDS = {
  "union-drive-marketplace": { lat: "42.0253", lng: "-93.6519" },
  "friley-windows": { lat: "42.0244", lng: "-93.6502" },
  "seasons-marketplace": { lat: "42.0227", lng: "-93.6393" }
};

export default function Dining() {
  const [loading, setLoading] = useState(true);
  const [diningData, setDiningData] = useState([]);
  const [selectedHall, setSelectedHall] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [version] = useState("1.0.6-Final");

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(startOfDay(new Date()), i);
    return {
      value: format(d, "yyyy-MM-dd"),
      label: format(d, "MM/dd"),
      day: format(d, "EEE", { locale: ko }),
      isToday: i === 0
    };
  });

  const fetchDiningData = useCallback(async (date) => {
    try {
      setLoading(true);
      const res = await api.get(`/dining?date=${date}&cache_bust=${Date.now()}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setDiningData(data);
      if (data.length > 0) {
        if (!selectedHall || !data.find(h => h.slug === selectedHall)) {
          setSelectedHall(data[0].slug);
        }
      }
    } catch (err) {
      console.error("Critical: Dining fetch failed", err);
      setDiningData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedHall]);

  useEffect(() => {
    fetchDiningData(selectedDate);
  }, [selectedDate, fetchDiningData]);

  const openMap = (hall) => {
    // Priority: 1. Server lat/lng -> 2. Hardcoded EMERGENCY_COORDS -> 3. Fail
    const lat = hall.lat || EMERGENCY_COORDS[hall.slug]?.lat;
    const lng = hall.lng || EMERGENCY_COORDS[hall.slug]?.lng;

    if (!lat || !lng) {
      alert("좌표 데이터가 유실되었습니다. v1.0.6-Final 버전인지 확인해주세요.");
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tighter">오늘의 학식</h1>
            <Badge variant="secondary" className="text-[8px] h-4 font-mono opacity-50">v{version}</Badge>
          </div>
          <p className="text-[var(--text-dim)] text-[10px] fp-mono uppercase tracking-widest">ISU Dining Guide</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => fetchDiningData(selectedDate)} className="h-9 w-9 text-[var(--text-dim)]">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
        {dates.map((d) => (
          <button
            key={d.value}
            onClick={() => setSelectedDate(d.value)}
            className={`flex flex-col items-center justify-center min-w-[62px] py-3 border transition-all ${
              selectedDate === d.value
                ? "bg-[var(--red)] border-[var(--red)] text-white shadow-lg scale-105 z-10"
                : "bg-[var(--bg-card)] border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--text-mute)]"
            }`}
          >
            <span className="text-[9px] fp-mono uppercase opacity-60 mb-0.5">{d.day}</span>
            <span className="text-[13px] font-bold tracking-tighter">{d.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-none" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-40 w-full rounded-none" />
            <Skeleton className="h-40 w-full rounded-none" />
          </div>
        </div>
      ) : diningData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-[var(--bg-card)] border border-[var(--line)] text-[var(--text-mute)]">
          <AlertCircle className="w-10 h-10 mb-4 opacity-10" />
          <p className="text-xs uppercase tracking-widest fp-mono text-center leading-relaxed">
            데이터를 불러올 수 없습니다.<br/>서버가 현재 재시작 중입니다.
          </p>
        </div>
      ) : (
        <Tabs value={selectedHall} onValueChange={setSelectedHall} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[var(--bg-card)] border border-[var(--line)] h-12 rounded-none">
            {diningData.map((hall) => (
              <TabsTrigger key={hall.slug} value={hall.slug} className="text-[10px] uppercase font-bold tracking-tight fp-mono h-full data-[state=active]:bg-[var(--bg)]">
                {(hall.title || "").replace("Marketplace", "").replace("Dining Center", "").trim() || hall.slug}
              </TabsTrigger>
            ))}
          </TabsList>

          {diningData.map((hall) => (
            <TabsContent key={hall.slug} value={hall.slug} className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="flex items-center justify-between bg-[var(--bg-card)] p-5 border border-[var(--line)]">
                <div className="space-y-1">
                  <h2 className="font-bold text-lg leading-none">{hall.title || "ISU Dining Hall"}</h2>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(hall.paymentTypes || []).map((pt) => (
                      <span key={pt} className="text-[8px] uppercase tracking-tighter text-[var(--text-dim)] bg-[var(--bg)] px-1.5 py-0.5 border border-[var(--line)]">
                        {pt}
                      </span>
                    ))}
                  </div>
                </div>
                <Button 
                  onClick={() => openMap(hall)}
                  className="bg-[var(--bg)] hover:bg-[var(--bg-card)] text-[var(--text)] border border-[var(--line)] text-[10px] fp-mono uppercase h-9 px-3"
                >
                  <MapPin className="w-3.5 h-3.5 mr-2 text-[var(--red)]" />
                  📍 지도 보기
                </Button>
              </div>

              {hall.menus.length === 0 ? (
                <div className="py-24 border border-dashed border-[var(--line)] flex flex-col items-center justify-center bg-[var(--bg-card)]">
                  <Info className="w-8 h-8 mb-4 text-[var(--text-dim)] opacity-20" />
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-mute)] font-bold">Closed or No Data</p>
                </div>
              ) : (
                <Tabs defaultValue={hall.menus[0].section} className="w-full">
                  <TabsList className="flex overflow-x-auto bg-transparent border-b border-[var(--line)] rounded-none h-auto p-0 mb-8 no-scrollbar">
                    {hall.menus.map((meal) => (
                      <TabsTrigger 
                        key={meal.section} 
                        value={meal.section}
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--red)] data-[state=active]:text-[var(--text)] text-[var(--text-dim)] px-6 py-3 text-xs font-bold uppercase tracking-widest transition-all"
                      >
                        {meal.section}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {hall.menus.map((meal) => (
                    <TabsContent key={meal.section} value={meal.section} className="space-y-12 animate-in fade-in slide-in-from-right-3 duration-500">
                      {(meal.stations || []).map((station) => (
                        <div key={station.name} className="space-y-5">
                          <div className="flex items-center gap-4">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-[var(--red)] fp-mono">
                              {station.name}
                            </h3>
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--line)] to-transparent" />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(station.items || []).map((item, idx) => (
                              <Card key={idx} className="bg-[var(--bg-card)] border-[var(--line)] rounded-none hover:border-[var(--text-mute)] transition-all group cursor-default">
                                <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-start gap-4">
                                      <h4 className="font-bold text-[15px] leading-tight group-hover:text-[var(--red)] transition-colors">
                                        {item.name_ko || item.name}
                                      </h4>
                                      <span className="text-[9px] text-[var(--text-dim)] fp-mono whitespace-nowrap bg-[var(--bg)] px-2 py-1 border border-[var(--line)]">
                                        {item.totalCal} kcal
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-tight italic opacity-70">
                                      {item.name}
                                    </p>
                                  </div>

                                  <div className="flex gap-1 pt-1">
                                    {item.isVegan && <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[7px] py-0 px-1 rounded-none font-black">VEGAN</Badge>}
                                    {item.isHalal && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[7px] py-0 px-1 rounded-none font-black">HALAL</Badge>}
                                    {item.isVegetarian && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[7px] py-0 px-1 rounded-none font-black">VEGGIE</Badge>}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
