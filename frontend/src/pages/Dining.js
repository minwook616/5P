import React, { useState, useEffect } from "react";
import axios from "axios";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Utensils } from "lucide-react";

const API_BASE = process.env.REACT_APP_API_URL || "";

export default function Dining() {
  const [loading, setLoading] = useState(true);
  const [diningData, setDiningData] = useState([]);
  const [selectedHall, setSelectedHall] = useState("");

  useEffect(() => {
    fetchDiningData();
  }, []);

  const fetchDiningData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/dining`, { withCredentials: true });
      // Ensure res.data is an array to avoid mapping over non-array objects
      const data = Array.isArray(res.data) ? res.data : [];
      setDiningData(data);
      if (data.length > 0) {
        setSelectedHall(data[0].slug);
      }
    } catch (err) {
      console.error("Failed to fetch dining data", err);
      setDiningData([]);
    } finally {
      setLoading(false);
    }
  };

  const openMap = (lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, "_blank");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (diningData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--text-mute)]">
        <Utensils className="w-12 h-12 mb-4 opacity-20" />
        <p className="fp-mono text-xs uppercase tracking-widest">No dining data available for today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">오늘의 학식</h1>
          <p className="text-[var(--text-dim)] text-xs mt-1 fp-mono uppercase tracking-wider">ISU Dining Korean Guide</p>
        </div>
      </div>

      <Tabs value={selectedHall} onValueChange={setSelectedHall} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[var(--bg-card)] border border-[var(--line)]">
          {diningData.map((hall) => (
            <TabsTrigger key={hall.slug} value={hall.slug} className="text-[10px] uppercase tracking-tighter sm:tracking-widest fp-mono">
              {(hall.title || "").replace("Dining Center", "").replace("Marketplace", "").trim()}
            </TabsTrigger>
          ))}
        </TabsList>

        {diningData.map((hall) => (
          <TabsContent key={hall.slug} value={hall.slug} className="mt-6 space-y-6">
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
                <MapPin className="w-3 h-3 mr-2" />
                Map
              </Button>
            </div>

            {(!hall.menus || hall.menus.length === 0) ? (
              <p className="text-center py-10 text-[var(--text-mute)] text-xs fp-mono">Closed Today</p>
            ) : (
              <Tabs defaultValue={hall.menus[0].section} className="w-full">
                <TabsList className="flex overflow-x-auto bg-transparent border-b border-[var(--line)] rounded-none h-auto p-0 mb-6 no-scrollbar">
                  {hall.menus.map((meal) => (
                    <TabsTrigger 
                      key={meal.section} 
                      value={meal.section}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--red)] data-[state=active]:bg-transparent px-4 py-2 text-xs font-bold"
                    >
                      {meal.section}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {hall.menus.map((meal) => (
                  <TabsContent key={meal.section} value={meal.section} className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {(meal.stations || []).map((station) => (
                      <div key={station.name} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-[1px] flex-1 bg-[var(--line)]" />
                          <h3 className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-mute)] fp-mono whitespace-nowrap">
                            {station.name}
                          </h3>
                          <div className="h-[1px] flex-1 bg-[var(--line)]" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(station.items || []).map((item, idx) => (
                            <Card key={idx} className="bg-[var(--bg-card)] border-[var(--line)] rounded-none overflow-hidden hover:border-[var(--text-mute)] transition-colors">
                              <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-start gap-2">
                                    <h4 className="font-bold text-sm leading-snug">
                                      {item.name_ko || item.name}
                                    </h4>
                                    <span className="text-[10px] text-[var(--text-dim)] fp-mono whitespace-nowrap">
                                      {item.totalCal} kcal
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-tight">
                                    {item.name}
                                  </p>
                                </div>

                                <div className="flex gap-1">
                                  {item.isVegan && <Badge className="bg-green-900/30 text-green-400 border-green-900/50 text-[8px] py-0 px-1 rounded-none uppercase">Vegan</Badge>}
                                  {item.isHalal && <Badge className="bg-yellow-900/30 text-yellow-400 border-yellow-900/50 text-[8px] py-0 px-1 rounded-none uppercase">Halal</Badge>}
                                  {item.isVegetarian && <Badge className="bg-blue-900/30 text-blue-400 border-blue-900/50 text-[8px] py-0 px-1 rounded-none uppercase">Veggie</Badge>}
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
    </div>
  );
}
