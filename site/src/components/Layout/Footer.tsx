export const Footer: React.FC = () => {
  return (
    <footer className="py-12 px-6 bg-[#0A0A0F] border-t border-[#EAEAEA]/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-2xl font-['Cinzel'] text-[#D6AF36]">
            NIDALHEIM
          </div>

          <div className="flex gap-8">
            <a
              href="#home"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Home
            </a>
            <a
              href="#about"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              About
            </a>
            <a
              href="#patches"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Patch Notes
            </a>
            <a
              href="#community"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              Community
            </a>
          </div>

          <div className="text-muted-foreground text-sm">
            © 2025 Nidalheim. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};
