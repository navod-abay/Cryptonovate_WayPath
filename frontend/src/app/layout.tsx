import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Delivery Planning Platform',
  description: 'Enterprise Microservices Delivery & Route Planning SaaS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
