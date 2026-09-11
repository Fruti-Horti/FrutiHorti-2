import './Button.css';

const Button = ({ icon, label, onClick, type = "button", disabled = false }) => {
    return (
        <button type={type} className="button" onClick={onClick} disabled={disabled}>
            {icon}
            <span>{label}</span>
        </button>
    )
}

export default Button;