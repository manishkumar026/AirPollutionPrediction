
from app import app, db, User
from werkzeug.security import generate_password_hash

with app.app_context():
    users = User.query.all()
    print("--- User List ---")
    for u in users:
        print(f"ID: {u.id} | Username: {u.username} | Is Admin: {u.is_admin}")
    
    # Ensure admin exists
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        print("\nCreating admin user...")
        admin = User(username='admin', password=generate_password_hash('admin123'), is_admin=True)
        db.session.add(admin)
        db.session.commit()
        print("Admin created!")
    else:
        print(f"\nAdmin user found with ID: {admin.id}")
