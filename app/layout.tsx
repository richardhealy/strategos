export const metadata = {
  title: "strategos",
  description: "Autonomous AI Technical Program Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-sans-serif, system-ui", margin: 0, background: "#0b0e14", color: "#e6e6e6" }}>
        {children}
      </body>
    </html>
  );
}
