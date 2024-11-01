"use client"; // Bu satırı ekleyin

import { useState } from 'react';
import styles from "./css/styles.module.css";
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  const [sitemapUrl] = useState('https://crowstv.com/post-sitemap.xml');
  const [numAccounts, setNumAccounts] = useState(1);
  const [report, setReport] = useState<{ account: number; successfulUrls: number; error429Count: number; totalUrls: number; }[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/indexUrls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemapUrl, numAccounts })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Link className='flex justify-center' href="https://crowstv.com">
          <Image
            src="/crowstv-logo-white.webp"
            alt="Logo"
            width={150}
            height={37}
            className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70]"
          />
        </Link>
        <h1 className={styles.formTitle}>URL Indexing Tool</h1>

        <label>
          Number of Accounts (1-6):
        </label>
        <input
          className={styles.input}
          type="number"
          value={numAccounts}
          onChange={(e) => setNumAccounts(Number(e.target.value))}
          min="1"
          max="6"
          required
        />
        <br />
        <button className={styles.button} type="submit" disabled={loading}>
          <div className={styles.dots_border}></div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            className={styles.sparkle}
          >
            {/* SVG paths */}
          </svg>
          <span className={styles.text_button}>{loading ? 'Processing...' : 'Start Index'}</span>
        </button>
      </form>

      {report && (
        <div className={styles.resultContainer}>
          {report.map((item, index) => (
            <div
              className={item.error429Count > 0 ? styles.resultFail : styles.resultSuccess}
              key={index}
            >
              <p>
                <strong>Account {item.account}:</strong>
              </p>
              <p>
                {item.error429Count > 0
                  ? `429 Errors: ${item.error429Count}`
                  : 'Successful'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
