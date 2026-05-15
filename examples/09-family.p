# Family Relationships
# Demonstrates relational reasoning

parent(bob, alice)
parent(bob, charlie)
male(bob)

# Alice is Bob's child (child is inverse of parent)
child(alice, bob)
child(charlie, bob)

# Prove: Alice is related to Bob
child(alice, bob)