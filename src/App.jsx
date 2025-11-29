import { useState } from 'react';
import LandingPage from './components/LandingPage';
import TrackingPage from './components/TrackingPage';
import './App.css';

function App() {
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' or 'tracking'
  
  const handleStartTracking = () => {
    setCurrentPage('tracking');
  };
  
  const handleBackToHome = () => {
    setCurrentPage('landing');
  };

  return (
    <div className="app">
      {currentPage === 'landing' ? (
        <LandingPage onStartTracking={handleStartTracking} />
      ) : (
        <TrackingPage onBackToHome={handleBackToHome} />
      )}
    </div>
  );
}

export default App;
