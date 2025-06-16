import React from 'react';

type LogoIconProps = React.SVGProps<SVGSVGElement>

const LogoIcon: React.FC<LogoIconProps> = (props) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M5.5 3H17.5L21 6.5V16.5L17.5 20H6.5L3 16.5V6.5L5.5 3ZM7.5 5.5V10.5L8.5 11.5H7L5.5 13V17L10.5 12L15.5 17V13L14 11.5H12.5L13.5 10.5V5.5L12 7H9L7.5 5.5Z" fill="currentColor"/>
  </svg>
);

export default LogoIcon; 