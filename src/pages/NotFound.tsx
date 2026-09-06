import { Button } from "@/components/ui/button";
import { TrustLensMark } from "@/components/TrustLensMark";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="paper flex min-h-screen flex-col"
    >
      {/* Main Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-xl text-center">
          <div className="flex justify-center">
            <TrustLensMark className="size-14 text-primary" />
          </div>
          <p className="arch-label mt-8 text-primary">404 · Lost signal</p>
          <h1 className="mt-3 font-display text-5xl font-bold tracking-tight">
            Page not found
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            This line isn't connected. Head back to the console — your guard
            keeps listening.
          </p>
          <Button asChild className="mt-8 gap-2">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back to Trust Lens
            </Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
