import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Calorietext — Calorie tracking that lives in your texts", description: "Send a photo or describe your meal. Explore a simpler way to track calories, macros, and daily progress through your messages.", icons: {icon:"/favicon.svg"}, openGraph: { title:"Calorietext", description:"Your next healthy habit starts with a text.", type:"website"} };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
