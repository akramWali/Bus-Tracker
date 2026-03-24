import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, RefreshCw, Bus, Clock, WifiOff, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetNextBuses } from "@workspace/api-client-react";
import { BusCard } from "@/components/BusCard";

type DirectionPanelProps = {
  label: string;
  subtitle: string;
  departures: Array<{
    expectedArrivalTime: string;
    minutesUntilArrival: number;
    destination: string;
    formattedTime: string;
    vehicleRef: string;
    direction: string;
  }>;
  icon: React.ReactNode;
  accentClass: string;
};

function DirectionPanel({ label, subtitle, departures, icon, accentClass }: DirectionPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-3 px-1`}>
        <div className={`p-2 rounded-xl ${accentClass}`}>
          {icon}
        </div>
        <div>
          <h2 className="font-display font-bold text-lg text-foreground leading-tight">{label}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {departures.length === 0 ? (
        <div className="glass-card rounded-2xl p-5 text-center text-muted-foreground">
          <Bus className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun bus prévu</p>
        </div>
      ) : (
        departures.map((dep, idx) => (
          <BusCard key={`${dep.vehicleRef}-${dep.expectedArrivalTime}`} departure={dep} index={idx} />
        ))
      )}
    </div>
  );
}

export default function Home() {
  const { data, isLoading, isError, refetch, isRefetching, dataUpdatedAt } = useGetNextBuses({
    query: {
      refetchInterval: 30000,
      staleTime: 10000,
      retry: 2,
    },
  });

  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefreshTime(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  const isEmpty =
    data && data.towardsPDO.length === 0 && data.towardsASM.length === 0;

  return (
    <div className="min-h-screen relative bg-background text-foreground overflow-x-hidden">
      <div className="fixed inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/bg-navy-mesh.png`}
          alt="Abstract Background"
          className="w-full h-full object-cover opacity-60 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-12 min-h-screen flex flex-col">

        <header className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4">
                <Bus className="w-4 h-4" />
                <span className="text-sm font-bold tracking-wider">LIGNE 197</span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-gradient mb-2">
                Prochains Passages
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-5 h-5 text-primary" />
                <span className="text-lg">Place de la Résistance</span>
              </div>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isRefetching || isLoading}
              className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 group shadow-lg"
              aria-label="Actualiser"
            >
              <RefreshCw
                className={`w-6 h-6 text-foreground group-hover:text-primary transition-colors ${isRefetching || isLoading ? "animate-spin text-primary" : ""}`}
              />
            </button>
          </motion.div>
        </header>

        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait">
            {isLoading && !data ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-xl bg-primary/20 animate-pulse" />
                  <Loader2 className="w-12 h-12 animate-spin text-primary relative z-10" />
                </div>
                <p className="mt-4 font-medium">Chargement des horaires...</p>
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center"
              >
                <div className="glass-panel p-8 rounded-3xl text-center max-w-md border-destructive/30 bg-destructive/5">
                  <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4 text-destructive">
                    <WifiOff className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground mb-2">Erreur de connexion</h3>
                  <p className="text-muted-foreground mb-6">
                    Impossible de récupérer les horaires. Le service Île-de-France Mobilités est peut-être indisponible.
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
                  >
                    Réessayer
                  </button>
                </div>
              </motion.div>
            ) : isEmpty ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center text-muted-foreground"
              >
                <Bus className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">Aucun bus prévu pour le moment.</p>
                <p className="text-sm">Fin de service ou perturbation possible.</p>
              </motion.div>
            ) : (
              <motion.div key="list" className="flex flex-col gap-8">
                <DirectionPanel
                  label="Porte d'Orléans"
                  subtitle="Direction Paris"
                  departures={data?.towardsPDO ?? []}
                  icon={<ArrowUp className="w-5 h-5 text-primary" />}
                  accentClass="bg-primary/15 text-primary"
                />
                <DirectionPanel
                  label="Avenue Saint-Marc"
                  subtitle="Direction Massy"
                  departures={data?.towardsASM ?? []}
                  icon={<ArrowDown className="w-5 h-5 text-accent" />}
                  accentClass="bg-accent/15 text-accent"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="mt-8 pt-6 border-t border-border/50 text-center flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-black/20 px-4 py-2 rounded-full border border-white/5 backdrop-blur-sm">
            <Clock className="w-4 h-4" />
            <span>
              Mise à jour :{" "}
              {lastRefreshTime ? (
                <span className="font-medium text-foreground">
                  {format(lastRefreshTime, "HH:mm:ss", { locale: fr })}
                </span>
              ) : (
                "---"
              )}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            Données fournies par Île-de-France Mobilités en temps réel
          </p>
        </footer>
      </main>
    </div>
  );
}
