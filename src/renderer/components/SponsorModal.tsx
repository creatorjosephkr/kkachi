import React, { useRef } from 'react';
import kakaobankQr from '../../../spon/kakaobank.png';
import paypalLogo from '../../../spon/paypal.png';
import { CloseIcon } from './Icons';

const PAYPAL_DONATE_URL =
  'https://www.paypal.com/paypalme/tech1010?locale.x=ko_KR&country.x=KR';

interface SponsorModalProps {
  onClose: () => void;
}

export const SponsorModal: React.FC<SponsorModalProps> = ({ onClose }) => {
  const backdropMouseDownRef = useRef(false);

  const handleOpenPaypal = () => {
    void window.kkachi.openExternal(PAYPAL_DONATE_URL);
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <div
        className="modal-card sponsor-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>개발자 후원하기</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="닫기">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="sponsor-intro">
            까치(Kkachi)를 유용하게 사용하고 계신가요? 따뜻한 커피 한 잔의 후원이
            지속적인 기능 개선과 유지보수에 큰 힘이 됩니다.
          </p>

          <div className="sponsor-grid">
            <div className="sponsor-card">
              <div className="sponsor-card-title">카카오뱅크</div>
              <div className="sponsor-media-box">
                <img
                  src={kakaobankQr}
                  alt="카카오뱅크 후원 QR 코드"
                  className="sponsor-qr-img"
                />
              </div>
              <p className="sponsor-card-desc">
                카카오뱅크 앱 또는 스마트폰 카메라로 QR 코드를 스캔하여 간편하게
                후원하실 수 있습니다.
              </p>
            </div>

            <div className="sponsor-card">
              <div className="sponsor-card-title">PayPal</div>
              <button
                type="button"
                className="sponsor-media-box sponsor-media-btn"
                title="PayPal 후원 페이지 열기"
                onClick={handleOpenPaypal}
              >
                <img
                  src={paypalLogo}
                  alt="PayPal 로고"
                  className="sponsor-paypal-img"
                />
              </button>
              <p className="sponsor-card-desc">
                해외 결제 및 글로벌 후원은 아래 버튼을 눌러 PayPal로 참여하실 수
                있습니다.
              </p>
              <button
                type="button"
                className="btn btn-secondary sponsor-link-btn"
                onClick={handleOpenPaypal}
              >
                PayPal로 후원하기
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
