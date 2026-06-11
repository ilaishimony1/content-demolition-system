export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-500 mb-8">Last updated: June 11, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. About This App</h2>
        <p>Content Demolition is a social media management platform that allows agencies to manage, schedule, and publish content on behalf of their clients on Instagram and other social platforms.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Data We Collect</h2>
        <p className="mb-2">When you connect your Instagram account, we collect:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Instagram username and profile picture</li>
          <li>Follower count and basic account metrics</li>
          <li>Access tokens to publish content on your behalf</li>
          <li>Media and content you authorize us to manage</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. How We Use Your Data</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To publish content to your Instagram account at scheduled times</li>
          <li>To display your profile information within our platform</li>
          <li>To analyze content performance and engagement</li>
          <li>We never sell your data to third parties</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Data Storage</h2>
        <p>Your data is stored securely using Google Firebase. Access tokens are encrypted and stored only for the purpose of publishing content on your behalf.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Data Deletion</h2>
        <p>You can request deletion of all your data at any time by contacting us at <a href="mailto:ilaishimony1@gmail.com" className="text-blue-600">ilaishimony1@gmail.com</a> or by disconnecting your Instagram account from our platform. We will delete all associated data within 30 days.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Third-Party Services</h2>
        <p>We use the Instagram Graph API (Meta) to access and publish content. Your use of Instagram is subject to <a href="https://help.instagram.com/519522125107875" className="text-blue-600" target="_blank" rel="noopener noreferrer">Instagram's Privacy Policy</a>.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
        <p>For any privacy-related questions, contact us at: <a href="mailto:ilaishimony1@gmail.com" className="text-blue-600">ilaishimony1@gmail.com</a></p>
      </section>
    </div>
  );
}
