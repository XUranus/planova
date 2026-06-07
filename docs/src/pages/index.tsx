import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const features = [
  {
    emoji: '🏠',
    title: 'AI Parsing',
    description:
      'Upload a floor plan image, AI extracts rooms, walls, doors, and windows',
  },
  {
    emoji: '🛋️',
    title: 'Auto Furniture',
    description:
      'AI arranges furniture based on room type, size, and style',
  },
  {
    emoji: '🚶',
    title: 'Walk Through',
    description:
      'WASD first-person navigation through your 3D room',
  },
  {
    emoji: '🎨',
    title: '6 Styles',
    description:
      'Modern Luxury, Cream, Nordic, New Chinese, Wabi-Sabi, Industrial',
  },
  {
    emoji: '🔍',
    title: 'Scene Inspector',
    description:
      'Edit every element — objects, materials, lights, cameras',
  },
  {
    emoji: '📤',
    title: 'Export',
    description:
      'GLB file for other 3D tools, AI photorealistic rendering',
  },
];

const styles: Record<string, React.CSSProperties> = {
  hero: {
    padding: '5rem 1rem',
    textAlign: 'center' as const,
    background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)',
    color: '#fff',
  },
  heroTitle: {
    fontSize: '3.5rem',
    fontWeight: 800,
    marginBottom: '0.5rem',
    letterSpacing: '-0.02em',
  },
  heroSubtitle: {
    fontSize: '1.35rem',
    opacity: 0.9,
    marginBottom: '2rem',
    fontWeight: 400,
  },
  ctaButton: {
    display: 'inline-block',
    padding: '0.85rem 2.2rem',
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#2563eb',
    backgroundColor: '#fff',
    borderRadius: '8px',
    textDecoration: 'none',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
  },
  featuresSection: {
    padding: '4rem 1rem',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  featuresHeading: {
    textAlign: 'center' as const,
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '2.5rem',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1.5rem',
  },
  featureCard: {
    padding: '1.5rem',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#fff',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  },
  featureEmoji: {
    fontSize: '2rem',
    marginBottom: '0.5rem',
  },
  featureTitle: {
    fontSize: '1.15rem',
    fontWeight: 700,
    marginBottom: '0.4rem',
  },
  featureDesc: {
    fontSize: '0.95rem',
    color: '#4b5563',
    lineHeight: 1.5,
    margin: 0,
  },
  screenshotSection: {
    padding: '3rem 1rem 5rem',
    textAlign: 'center' as const,
  },
  screenshotHeading: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
  },
  screenshot: {
    maxWidth: '900px',
    width: '100%',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
  },
};

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="AI Floor Plan to 3D Interior"
      description="Upload a floor plan, get a walkable 3D interior with AI-placed furniture."
    >
      {/* Hero Section */}
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>Planova</h1>
        <p style={styles.heroSubtitle}>AI Floor Plan to 3D Interior</p>
        <Link style={styles.ctaButton} to="/getting-started/installation">
          Get Started &rarr;
        </Link>
      </section>

      {/* Features Grid */}
      <section style={styles.featuresSection}>
        <h2 style={styles.featuresHeading}>Features</h2>
        <div style={styles.featuresGrid}>
          {features.map((f) => (
            <div key={f.title} style={styles.featureCard}>
              <div style={styles.featureEmoji}>{f.emoji}</div>
              <div style={styles.featureTitle}>{f.title}</div>
              <p style={styles.featureDesc}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Screenshot Section */}
      <section style={styles.screenshotSection}>
        <h2 style={styles.screenshotHeading}>See It in Action</h2>
        <img
          src="/img/Screenshot_20260508_195100.png"
          alt="Planova"
          style={styles.screenshot}
        />
      </section>
    </Layout>
  );
}
