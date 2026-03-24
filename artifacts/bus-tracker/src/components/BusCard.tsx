import { BusFront, Clock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import type { BusDeparture } from "@workspace/api-client-react/src/generated/api.schemas";

interface BusCardProps {
  departure: BusDeparture;
  index: number;
}

export function BusCard({ departure, index }: BusCardProps) {
  const isApproaching = departure.minutesUntilArrival <= 1;
  const isSoon = departure.minutesUntilArrival > 1 && departure.minutesUntilArrival <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.1,
        ease: [0.23, 1, 0.32, 1] 
      }}
      className="glass-card rounded-2xl p-5 relative overflow-hidden group"
    >
      {/* Decorative accent line */}
      <div 
        className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-500 ${
          isApproaching ? 'bg-destructive' : isSoon ? 'bg-warning' : 'bg-primary'
        }`} 
      />

      <div className="flex items-center justify-between ml-2">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={`p-3 rounded-xl flex-shrink-0 ${
            isApproaching 
              ? 'bg-destructive/20 text-destructive' 
              : isSoon 
                ? 'bg-warning/20 text-warning' 
                : 'bg-primary/20 text-primary'
          }`}>
            <BusFront className="w-6 h-6" />
          </div>
          
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-display text-xl font-bold text-foreground truncate">
              {departure.destination}
            </h3>
            {departure.vehicleRef && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span className="bg-secondary/50 px-2 py-0.5 rounded-md text-xs font-medium border border-border/50">
                  Course {departure.vehicleRef}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          <div className="flex items-baseline gap-1">
            {isApproaching ? (
              <motion.div 
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-2 text-destructive font-bold text-lg"
              >
                <AlertCircle className="w-4 h-4" />
                <span>À l'approche</span>
              </motion.div>
            ) : (
              <>
                <span className={`font-display text-3xl font-bold tracking-tight ${isSoon ? 'text-warning' : 'text-primary'}`}>
                  {departure.minutesUntilArrival}
                </span>
                <span className="text-muted-foreground font-medium mb-1">min</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1 bg-black/20 px-2.5 py-1 rounded-lg border border-white/5">
            <Clock className="w-3.5 h-3.5" />
            <span>{departure.formattedTime}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
