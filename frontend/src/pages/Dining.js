import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Utensils, Calendar as CalendarIcon } from "lucide-react";
import { format, addDays, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";

const API_BASE = process.env.REACT_APP_API_URL || "";

export default function Dining() {
  const [loading, setLoading] = useState(true);
  const [diningData, setDiningData] = useState([]);
  const [selectedHall, setSelectedHall] = useState("");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Generate 14 days starting from today
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
      const res = await axios.get(`${API_BASE}/api/dining?date=${date}`, { withCredentials: true });
      const data = Array.isArray(res.data) ? res.data : [];
      setDiningData(data);
      if (data.length > 0) {
        // Keep the same hall selected if it exists in the new data, otherwise pick the first one
        if (!data.find(h => h.slug === selectedHall)) {
          setSelectedHall(data[0].slug);
        }
      }
    } catch (err) {
      console.error("Failed to fetch dining data", err);
      setDiningData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedHall]);

  useEffect(() => {
    fetchDiningData(selectedDate);
  }, [selectedDate, fetchDiningData]);

  const openMap = (lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">오늘의 학식</h1>
          <p className="text-[var(--text-dim)] text-xs mt-1 fp-mono uppercase tracking-wider">ISU Dining Korean Guide</p>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
        {dates.map((d) => (
          <button
            key={d.value}
            onClick={() => setSelectedDate(d.value)}
            className={`flex flex-col items-center justify-center min-w-[60px] py-3 border transition-all ${
              selectedDate === d.value
                ? "bg-[var(--red)] border-[var(--red)] text-white shadow-lg"
                : "bg-[var(--bg-card)] border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--text-mute)]"
            }`}
          >
            <span className="text-[10px] fp-mono uppercase opacity-70 mb-1">{d.day}</span>
            <span className="text-sm font-bold tracking-tighter">{d.label}</span>
            {d.isToday && <span className="mt-1 w-1 h-1 rounded-full bg-current" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      ) : diningData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-mute)] bg-[var(--bg-card)] border border-[var(--line)]">
          <Utensils className="w-12 h-12 mb-4 opacity-10" />
          <p className="fp-mono text-xs uppercase tracking-[0.3em]">No menu for {selectedDate}</p>
        </div>
      ) : (
        <Tabs value={selectedHall} onValueChange={setSelectedHall} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-[var(--bg-card)] border border-[var(--line)] h-12">
            {diningData.map((hall) => (
              <TabsTrigger key={hall.slug} value={hall.slug} className="text-[10px] uppercase tracking-tighter sm:tracking-widest fp-mono h-full">
                {(hall.title || "").replace("Dining Center", "").replace("Marketplace", "").trim()}
              </TabsTrigger>
            ))}
          </TabsList>

          {diningData.map((hall) => (
            <TabsContent key={hall.slug} value={hall.slug} className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between bg-[var(--bg-card)] p-4 border border-[var(--line)]">
                <div>
                  <h2 className="font-bold text-lg">{hall.title || "Unknown Hall"}</h2>
                  <div className="flex gap-2 mt-2">
                    {(hall.paymentTypes || []).map((pt) => (
                      <Badge key={pt} variant="outline" className="text-[9px] uppercase font-normal py-0 px-1 opacity-60">
                        {pt}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => openMap(hall.lat, hall.lng)}
                  className="text-xs fp-mono uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text)]"
                >
                  <MapPin className="w-3 h-3 mr-2 text-[var(--red)]" />
                  Map
                </Button>
              </div>

              {(!hall.menus || hall.menus.length === 0) ? (
                <div className="text-center py-20 bg-[var(--bg-card)] border border-dashed border-[var(--line)]">
                  <p className="text-[var(--text-mute)] text-xs fp-mono uppercase tracking-widest">Closed This Day</p>
                </div>
              ) : (
                <Tabs defaultValue={hall.menus[0].section} className="w-full">
                  <TabsList className="flex overflow-x-auto bg-transparent border-b border-[var(--line)] rounded-none h-auto p-0 mb-8 no-scrollbar">
                    {hall.menus.map((meal) => (
                      <TabsTrigger 
                        key={meal.section} 
                        value={meal.section}
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--red)] data-[state=active]:bg-transparent px-6 py-3 text-xs font-bold uppercase tracking-wider"
                      >
                        {meal.section}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {hall.menus.map((meal) => (
                    <TabsContent key={meal.section} value={meal.section} className="space-y-12 animate-in fade-in slide-in-from-right-2 duration-400">
                      {(meal.stations || []).map((station) => (
                        <div key={station.name} className="space-y-4">
                          <div className="flex items-center gap-3">
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.4em] text-[var(--red)] fp-mono whitespace-nowrap">
                              {station.name}
                            </h3>
                            <div className="h-[1px] flex-1 bg-[var(--line)]" />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(station.items || []).map((item, idx) => (
                              <Card key={idx} className="bg-[var(--bg-card)] border-[var(--line)] rounded-none overflow-hidden hover:border-[var(--text-mute)] transition-all duration-200 group">
                                <CardContent className="p-4 flex flex-col justify-between h-full space-y-4">
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-start gap-4">
                                      <h4 className="font-bold text-[15px] leading-tight group-hover:text-[var(--red)] transition-colors">
                                        {item.name_ko || item.name}
                                      </h4>
                                      <span className="text-[10px] text-[var(--text-dim)] fp-mono whitespace-nowrap bg-[var(--bg)] px-2 py-1">
                                        {item.totalCal} kcal
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-dim)] uppercase tracking-tight italic">
                                      {item.name}
                                    </p>
                                  </div>

                                  <div className="flex gap-1.5 pt-2">
                                    {item.isVegan && <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[8px] py-0 px-1.5 rounded-none uppercase font-bold tracking-tighter">Vegan</Badge>}
                                    {item.isHalal && <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] py-0 px-1.5 rounded-none uppercase font-bold tracking-tighter">Halal</Badge>}
                                    {item.isVegetarian && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[8px] py-0 px-1.5 rounded-none uppercase font-bold tracking-tighter">Veggie</Badge>}
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
