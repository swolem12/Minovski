import { useState, useEffect, useRef, useCallback } from 'react';
import { animate } from 'animejs';
import peerNetwork from '../utils/peerNetwork';
import './ChatPanel.css';

function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesRef = useRef(null);
  const panelRef = useRef(null);
  
  const animateNewMessage = useCallback(() => {
    if (messagesRef.current && messagesRef.current.lastChild) {
      animate(messagesRef.current.lastChild, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 300,
        ease: 'outQuad'
      });
    }
  }, []);
  
  // Listen for chat messages
  useEffect(() => {
    const unsubChatMessage = peerNetwork.on('chat-message', ({ peerId, message, timestamp, isLocal }) => {
      setMessages(prev => [
        ...prev.slice(-49), // Keep last 50 messages (49 old + 1 new)
        {
          id: `${peerId}-${timestamp}`,
          peerId,
          message,
          timestamp,
          isLocal: isLocal || false
        }
      ]);
      
      // Auto-scroll and animate
      setTimeout(() => {
        animateNewMessage();
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 10);
    });
    
    return () => {
      unsubChatMessage();
    };
  }, [animateNewMessage]);
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage) return;
    
    peerNetwork.broadcastChatMessage(trimmedMessage);
    setInputValue('');
  };
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (panelRef.current) {
      animate(panelRef.current, {
        height: isExpanded ? '50px' : 'auto',
        duration: 300,
        ease: 'outQuad'
      });
    }
  };
  
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  return (
    <div 
      className={`chat-panel ${isExpanded ? 'expanded' : ''}`}
      ref={panelRef}
    >
      <div className="chat-header" onClick={toggleExpand}>
        <div className="chat-title">
          <span className="chat-icon">💬</span>
          <span className="chat-text">Network Chat</span>
        </div>
        <div className="chat-badge">
          {messages.length > 0 && (
            <span className="message-count">{messages.length}</span>
          )}
        </div>
        <button className="chat-expand-btn">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="chat-content">
          <div className="messages-container" ref={messagesRef}>
            {messages.length === 0 ? (
              <div className="no-messages">
                <p>No messages yet</p>
                <p className="hint">Send a message to connected devices</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`message-item ${msg.isLocal ? 'local' : 'remote'}`}
                >
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.isLocal ? 'You' : msg.peerId.slice(0, 8)}
                    </span>
                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className="message-body">{msg.message}</div>
                </div>
              ))
            )}
          </div>
          
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="chat-input"
              maxLength={500}
            />
            <button type="submit" className="btn-send" disabled={!inputValue.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
