// ======================================================
// File Name : Button.jsx
// Purpose   : Reusable UI component: Button
// ======================================================

import { Link } from 'react-router-dom';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : classesFor
// Purpose  : Implements logic for 'classesFor'
// ======================================================

function classesFor(variant, size) {
    return ['btn', variant === 'primary' ? 'btn-primary' : 'btn-ghost', size === 'sm' ? 'btn-sm' : ''].filter(Boolean).join(' ');
}

// ======================================================
// END: classesFor
// ======================================================
/** Shared button. Renders a <button> normally, or a router <Link> when given a `to` prop. */
// ======================================================
// Function : Button
// Purpose  : React component that renders the 'Button' UI
// ======================================================

export function Button(props) {
    const { variant = 'primary', size = 'md', children } = props;
    const className = classesFor(variant, size);
    if ('to' in props && props.to) {
        return (<Link to={props.to} className={className} aria-disabled={props.disabled}>
        {children}
      </Link>);
    }
    const { to: _to, variant: _v, size: _s, children: _c, ...rest } = props;
    return (<button className={className} {...rest}>
      {children}
    </button>);
}

// ======================================================
// END: Button
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Button.jsx
// ======================================================
