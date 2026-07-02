import "./tokens.css";

export const metadata = {
  title: "strategos",
  description: "Autonomous AI Technical Program Manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
