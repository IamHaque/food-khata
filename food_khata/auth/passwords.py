"""Salted slow password hashing with standard library hashlib.scrypt (DEC-P1)."""

import hashlib
import hmac
import os

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Hash password using scrypt with a unique 16-byte random salt."""
    if not isinstance(password, str) or not password:
        raise ValueError("Password must be a non-empty string.")
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against a stored scrypt hash using constant-time comparison."""
    if not isinstance(password, str) or not isinstance(hashed, str):
        return False
    parts = hashed.split("$")
    if len(parts) != 6 or parts[0] != "scrypt":
        return False
    try:
        n = int(parts[1])
        r = int(parts[2])
        p = int(parts[3])
        salt = bytes.fromhex(parts[4])
        expected_derived = bytes.fromhex(parts[5])
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected_derived),
        )
        return hmac.compare_digest(derived, expected_derived)
    except Exception:
        return False


_DUMMY_SALT = b"\x00" * SALT_BYTES
_DUMMY_HASH = hashlib.scrypt(
    b"dummy_password",
    salt=_DUMMY_SALT,
    n=SCRYPT_N,
    r=SCRYPT_R,
    p=SCRYPT_P,
    dklen=SCRYPT_DKLEN,
)


def dummy_verify() -> bool:
    """Run a dummy scrypt computation to prevent user-enumeration timing side-channels."""
    derived = hashlib.scrypt(
        b"dummy_password",
        salt=_DUMMY_SALT,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return hmac.compare_digest(derived, _DUMMY_HASH) and False


MIN_PASSWORD_LENGTH = 10
# Shorter passwords are already refused by the length rule, so only common ones of 10+ characters are listed.
COMMON_PASSWORDS = frozenset("""
1234567890 0123456789 1234567891 12345678910 123456789012 1q2w3e4r5t 1qaz2wsx3edc 1q2w3e4r5t6y qwertyuiop
qwerty1234 qwerty12345 qwerty123456 qwertyuiop123 asdfghjkl1 asdfghjklq zxcvbnm123 password12 password123
password1234 password12345 passw0rd123 p@ssword123 p@ssw0rd123 password!23 password01 password11 password99
password2020 password2021 password2022 password2023 password2024 password2025 iloveyou12 iloveyou123 iloveyou1234
iloveyou123456 letmein123 letmein1234 welcome123 welcome1234 welcome12345 admin12345 admin123456 administrator
adminadmin changeme123 changeme1234 trustno1234 monkey1234 monkey12345 dragon1234 dragon12345 master1234
master12345 football12 football123 baseball12 baseball123 superman123 batman1234 princess12 princess123
sunshine12 sunshine123 whatever12 whatever123 shadow1234 michael123 jennifer12 jessica123 charlie123 thomas1234
daniel1234 matthew123 andrew1234 joshua1234 hunter1234 hunter12345 ranger1234 soccer1234 harley1234 buster1234
tigger1234 pepper1234 killer1234 george1234 maggie1234 summer2020 summer2021 summer2022 summer2023 summer2024
winter2020 winter2021 winter2022 winter2023 winter2024 spring2023 autumn2023 january123 february12 december12
abcd123456 abcdefghij abcdefg123 abcde12345 abc1234567 abcd1234567 aaaaaaaaaa bbbbbbbbbb 1111111111 2222222222
3333333333 4444444444 5555555555 6666666666 7777777777 8888888888 9999999999 0000000000 1212121212 1231231231
123123123 1234512345 12345678900 123456789a 123456789q 987654321 9876543210 0987654321 1029384756 0192837465
147258369 147258369 1472583690 159753456 159357852 456789123 7894561230 789456123 963852741 741852963
qazwsxedc1 qazwsxedcrfv zaq12wsxcde 1qazxsw23edc q1w2e3r4t5 q1w2e3r4t5y6 qweasdzxc1 qweasdzxcv qwertyasdf
asdfasdfas asdfghjkl123 zxcvbnmasd poiuytrewq lkjhgfdsa1 mnbvcxz123 qpalzmwoskxn pass123456 pass1234567
test123456 test1234567 testtest12 testing123 testing1234 guest12345 default123 login12345 user123456 root123456
computer12 computer123 internet12 internet123 football1234 freedom123 starwars123 pokemon123 liverpool1 chelsea123
arsenal123 manchester1 cricket123 india12345 india123456 bangalore1 mumbai1234 delhi12345 krishna123 shiva12345
ganesh1234 sachin1234 saibaba123 ramesh1234 suresh1234 rajesh1234 mahesh1234 priya12345 pooja12345 ganesha123
""".split())


def check_password_rules(password: str, username: str = "") -> str | None:
    """Return why a new password is refused, or None when it is acceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if username and password.lower() == username.strip().lower():
        return "Password must not be the same as the username."
    if password.lower() in COMMON_PASSWORDS:
        return "That password is too common; choose another."
    return None
