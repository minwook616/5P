import React, { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Utensils, AlertCircle, RefreshCw, Zap, Info } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

// ULTIMATE FRONTEND FALLBACK COORDS
const ULTIMATE_COORDS = {
  "union-drive-marketplace": { lat: "42.0253", lng: "-93.6519" },
  "friley-windows": { lat: "42.0244", lng: "-93.6502" },
  "seasons-marketplace": { lat: "42.0227", lng: "-93.6393" }
};

export default function Dining() {
  const [loading, setLoading] = useState(true);
  const [diningData, setDiningData] = useState([]);
  const [selectedHall, setSelectedHall] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [version] = useState("1.1.0-Release");

  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(startOfDay(new Date()), i);
    return {
      value: format(d, "yyyy-MM-dd"),
      label: format(d, "MM/dd"),
      day: format(d, "EEE", { locale: ko }),
    };
  });

  const fetchDiningData = useCallback(async (date) => {
    try {
      setLoading(true);
      // CACHE BUSTER: Force fresh data from server
      const res = await api.get(`/dining?date=${date}&release_bust=${Date.now()}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setDiningData(data);
      if (data.length > 0) {
        if (!selectedHall || !data.find(h => h.slug === selectedHall)) {
          setSelectedHall(data[0].slug);
        }
      }
    } catch (err) {
      console.error("Critical Fetch Error", err);
      setDiningData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedHall]);

  useEffect(() => {
    fetchDiningData(selectedDate);
  }, [selectedDate, fetchDiningData]);

  const openMap = (hall) => {
    const lat = hall.lat || ULTIMATE_COORDS[hall.slug]?.lat;
    const lng = hall.lng || ULTIMATE_COORDS[hall.slug]?.lng;

    if (!lat || !lng) {
      alert("지도 정보를 찾을 수 없습니다. v1.1.0 버전인지 확인해주세요.");
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
            <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[7px] h-4 font-black">v{version}</Badge>
          </div>
          <p className="text-[var(--text-dim)] text-[10px] fp-mono uppercase tracking-widest">ISU Dining Korean Guide</p>
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
            className={`flex flex-col items-center justify-center min-w-[62px] py-3 border transition-all duration-300 ${
              selectedDate === d.value
                ? "bg-[var(--red)] border-[var(--red)] text-white shadow-xl scale-105 z-10"
                : "bg-[var(--bg-card)] border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--text-mute)]"
            }`}
          >
            <span className="text-[9px] fp-mono uppercase opacity-60 mb-0.5">{d.day}</span>
            <span className="text-[13px] font-black tracking-tighter">{d.label}</span>
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
            데이터를 불러오는 중입니다.<br/>잠시 후 새로고침 버튼을 눌러주세요.
          </p>
        </div>
      ) : (
        <Tabs value={selectedHall} onValueChange={setSelectedHall} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[var(--bg-card)] border border-[var(--line)] h-12 rounded-none">
            {diningData.map((hall) => (
              <TabsTrigger key={hall.slug} value={hall.slug} className="text-[10px] uppercase font-black tracking-tight fp-mono h-full data-[state=active]:bg-[var(--bg)]">
                {(hall.title || "").replace("Marketplace", "").replace("Dining Center", "").trim() || hall.slug}
              </TabsTrigger>
            ))}
          </TabsList>

          {diningData.map((hall) => (
            <TabsContent key={hall.slug} value={hall.slug} className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between bg-[var(--bg-card)] p-5 border border-[var(--line)]">
                <h2 className="font-bold text-lg leading-none">{hall.title || "ISU Dining Hall"}</h2>
                <Button 
                  onClick={() => openMap(hall)}
                  className="bg-[var(--bg)] hover:bg-[var(--red)] hover:text-white text-[var(--text)] border border-[var(--line)] text-[9px] fp-mono font-black uppercase h-9 px-4 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 mr-2" />
                  📍 지도 보기
                </Button>
              </div>

              {(!hall.menus || hall.menus.length === 0) ? (
                <div className="py-24 border border-dashed border-[var(--line)] flex flex-col items-center justify-center bg-[var(--bg-card)]">
                  <RefreshCw className="w-8 h-8 mb-4 text-[var(--text-dim)] opacity-20 animate-spin" />
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] font-black">수집 중...</p>
                  <p className="text-[9px] text-[var(--text-dim)] mt-4 italic text-center px-8">ISU 서버에서 데이터를 긁어오고 있습니다.<br/>10초 후 우측 상단 새로고침을 눌러보세요.</p>
                </div>
              ) : (
                <Tabs defaultValue={hall.menus[0].section} className="w-full">
                  <TabsList className="flex overflow-x-auto bg-transparent border-b border-[var(--line)] rounded-none h-auto p-0 mb-8 no-scrollbar scroll-smooth">
                    {hall.menus.map((meal) => (
                      <TabsTrigger 
                        key={meal.section} 
                        value={meal.section}
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--red)] data-[state=active]:text-[var(--text)] text-[var(--text-dim)] px-8 py-3 text-xs font-black uppercase tracking-widest transition-all"
                      >
                        {meal.section}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {hall.menus.map((meal) => (
                    <TabsContent key={meal.section} value={meal.section} className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-600">
                      {(meal.stations || []).map((station) => (
                        <div key={station.name} className="space-y-5">
                          <div className="flex items-center gap-4">
                            <Zap className="w-3 h-3 text-[var(--red)] fill-[var(--red)]" />
                            <h3 className="text-[11px] font-black uppercase tracking-[0.6em] text-[var(--text)] fp-mono">
                              {station.name}
                            </h3>
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--line)] to-transparent" />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(station.items || []).map((item, idx) => (
                              <Card key={idx} className="bg-[var(--bg-card)] border-[var(--line)] rounded-none hover:border-[var(--red)] transition-all group cursor-default">
                                <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-start gap-4">
                                      <h4 className="font-bold text-[15px] leading-tight group-hover:text-[var(--red)] transition-colors">
                                        {item.name_ko || item.name}
                                      </h4>
                                      <span className="text-[9px] text-[var(--text-dim)] fp-mono whitespace-nowrap bg-[var(--bg)] px-2 py-1 border border-[var(--line)] font-bold">
                                        {item.totalCal} KCAL
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-tight italic opacity-50 font-medium">
                                      {item.name}
                                    </p>
                                  </div>

                                  <div className="flex gap-1 pt-1">
                                    {item.isVegan && <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[7px] py-0 px-1 rounded-none font-black tracking-tighter">VEGAN</Badge>}
                                    {item.isHalal && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[7px] py-0 px-1 rounded-none font-black tracking-tighter">HALAL</Badge>}
                                    {item.isVegetarian && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[7px] py-0 px-1 rounded-none font-black tracking-tighter">VEGGIE</Badge>}
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
